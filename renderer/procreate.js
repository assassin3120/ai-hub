// Procreate で描くための絵コンテのテンプレート（PNG）と、描き終えた画像をコマごとに切り分ける処理。
// テンプレートの大きさとコマの位置は画面比だけで決まるので、書き出した画像を読み込めば同じ位置で切り出せる。
(function (root) {
  const W = 2732; // iPad の横向きの画面と同じ 4:3
  const H = 2048;
  const MARGIN = 110;
  const HEAD = 150; // 上の題名の帯
  const GAP = 70;
  const LABEL = 78; // コマの上の「No.3 4秒」
  const LINE = 4;

  // 画面比から 1 ページのコマ割り（横×縦）を決める
  const grid = (ratio) => (ratio >= 1.3 ? [3, 3] : ratio >= 0.9 ? [3, 2] : [4, 1]);

  function layout(aspect) {
    const ratio = root.planDoc.ASPECTS[aspect] ?? 16 / 9;
    const [cols, rows] = grid(ratio);
    const cellW = (W - MARGIN * 2 - GAP * (cols - 1)) / cols;
    const cellH = (H - HEAD - MARGIN - GAP * (rows - 1)) / rows - LABEL;
    const fw = Math.floor(Math.min(cellW, cellH * ratio));
    const fh = Math.floor(fw / ratio);
    const gridW = fw * cols + GAP * (cols - 1);
    const gridH = (fh + LABEL) * rows + GAP * (rows - 1);
    const x0 = Math.round((W - gridW) / 2);
    const y0 = Math.round(HEAD + (H - HEAD - MARGIN - gridH) / 2);
    const frames = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) frames.push({ x: x0 + c * (fw + GAP), y: y0 + r * (fh + LABEL + GAP) + LABEL, w: fw, h: fh });
    }
    return { W, H, frames, perPage: frames.length };
  }

  const FONT = '"Zen Kaku Gothic New", "Hiragino Sans", "Noto Sans JP", sans-serif';

  // 1 ページ分のテンプレートを PNG の data URL で返す。cuts があれば番号・尺・ト書きの頭を添える
  async function templatePage(plan, page, pages) {
    await document.fonts.load(`700 40px ${FONT}`).catch(() => {});
    const L = layout(plan.aspect);
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const g = cv.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#9a9a9a';
    g.font = `700 46px ${FONT}`;
    g.textBaseline = 'alphabetic';
    g.fillText(plan.title || '絵コンテ', MARGIN, 96);
    g.font = `500 34px ${FONT}`;
    const right = `${plan.aspect || '16:9'}　${page + 1} / ${pages}`;
    g.fillText(right, W - MARGIN - g.measureText(right).width, 96);
    L.frames.forEach((f, k) => {
      const no = page * L.perPage + k + 1;
      const cut = (plan.cuts || [])[no - 1];
      g.fillStyle = '#9a9a9a';
      g.font = `700 40px ${FONT}`;
      g.fillText(`${no}`, f.x, f.y - 22);
      if (cut) {
        const head = `${cut.dur ? `${cut.dur}秒　` : ''}${String(cut.note || '').replace(/\s+/g, ' ')}`;
        g.font = `500 28px ${FONT}`;
        let text = head;
        const max = f.w - 80;
        while (text && g.measureText(text).width > max) text = text.slice(0, -1);
        g.fillText(text === head ? text : `${text}…`, f.x + 70, f.y - 24);
      }
      g.strokeStyle = '#b4b4b4';
      g.lineWidth = LINE;
      g.strokeRect(f.x - LINE / 2, f.y - LINE / 2, f.w + LINE, f.h + LINE);
    });
    return cv.toDataURL('image/png');
  }

  const loadImage = (blob) => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`${blob.name || '画像'} を読めませんでした`)); };
    img.src = url;
  });

  // 何も描いていないコマは飛ばす（白以外の点がほとんどない）
  function isBlank(g, w, h) {
    const d = g.getImageData(0, 0, w, h).data;
    let ink = 0;
    let n = 0;
    for (let i = 0; i < d.length; i += 4 * 7) {
      n++;
      if (d[i + 3] > 20 && d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11 < 225) ink++;
    }
    return ink / n < 0.002;
  }

  // Procreate から書き出した 1 ページを、コマごとの PNG（data URL、描いていないコマは null）に切り分ける
  async function slicePage(plan, blob) {
    const img = await loadImage(blob);
    if (Math.abs(img.width / img.height - W / H) > 0.02) throw new Error(`${blob.name || '画像'} はテンプレートと縦横の比が違います（テンプレートを読み込んで描いたものを書き出してください）`);
    const s = img.width / W;
    const inset = LINE * 2;
    return layout(plan.aspect).frames.map((f) => {
      const w = Math.round((f.w - inset * 2) * s);
      const h = Math.round((f.h - inset * 2) * s);
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      const g = cv.getContext('2d', { willReadFrequently: true });
      g.fillStyle = '#fff';
      g.fillRect(0, 0, w, h);
      g.drawImage(img, (f.x + inset) * s, (f.y + inset) * s, w, h, 0, 0, w, h);
      return isBlank(g, w, h) ? null : cv.toDataURL('image/png');
    });
  }

  // ファイル名の _p2 からページ番号を読む。なければ選んだ順
  const pageOf = (name) => { const m = String(name).match(/_p(\d+)/i); return m ? Number(m[1]) - 1 : null; };

  root.procreate = { layout, templatePage, slicePage, pageOf };
})(window);
