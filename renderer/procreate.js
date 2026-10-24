// Procreate 用の絵コンテテンプレート（iPad のキャンバスと同じ 2732×2048 の PNG）を作り、
// 描き終えて書き出した画像を読み込んで、コマごとに切り分ける。
// テンプレートの右下に小さな四角の並び（読み取り用の印）を描いておき、読み込むときに
// 画面比とページ番号を読み取るので、どのページの画像をどの順で落としても正しいカットにはまる。
(function (root) {
  const W = 2732;
  const H = 2048;
  const M = 110; // 余白
  const TOP = 210; // 見出しの高さ
  const GAP = 60;
  const LABEL = 56; // コマの上のカット番号
  const NOTE = 118; // コマの下のト書き
  const FONT = '"A P-OTF 中ゴシックBBB Pr6N", "Hiragino Sans", "Noto Sans JP", sans-serif';

  const ASPECT_KEYS = ['16:9', '9:16', '4:3', '1:1', '2.39:1'];
  const ratioOf = (aspect) => window.planDoc.ASPECTS[aspect] ?? 16 / 9;
  const grid = (aspect) => ({ '16:9': [3, 2], '4:3': [3, 2], '2.39:1': [3, 3], '1:1': [4, 2], '9:16': [5, 1] }[aspect] ?? [3, 2]);
  const perPage = (aspect) => { const [c, r] = grid(aspect); return c * r; };

  // 1ページ分のコマの位置（ピクセル）
  function frames(aspect) {
    const [cols, rows] = grid(aspect);
    const ratio = ratioOf(aspect);
    const cellW = (W - 2 * M - (cols - 1) * GAP) / cols;
    const cellH = (H - TOP - M - (rows - 1) * GAP) / rows;
    const fw = Math.min(cellW, (cellH - LABEL - NOTE) * ratio);
    const fh = fw / ratio;
    const out = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = M + c * (cellW + GAP);
        const cy = TOP + r * (cellH + GAP);
        out.push({ x: Math.round(cx + (cellW - fw) / 2), y: Math.round(cy + LABEL), w: Math.round(fw), h: Math.round(fh), cellX: cx, cellW });
      }
    }
    return out;
  }

  // 読み取り用の印：画面比 3bit・ページ 8bit・偶奇 1bit の 12 個の四角
  const BITS = 12;
  const SQ = 26;
  const markAt = (i) => ({ x: W - M - (BITS - i) * (SQ + 8), y: H - 76 });
  const encode = (aspect, page) => {
    const v = (ASPECT_KEYS.indexOf(aspect) & 7) | ((page & 255) << 3);
    const bits = Array.from({ length: BITS - 1 }, (_, i) => (v >> i) & 1);
    return [...bits, bits.reduce((a, b) => a ^ b, 0)];
  };

  const wrap = (ctx, text, maxW, maxLines) => {
    const lines = [];
    let line = '';
    for (const ch of String(text || '').replace(/\n/g, ' ')) {
      if (ctx.measureText(line + ch).width > maxW) { lines.push(line); line = ch; if (lines.length === maxLines) break; } else line += ch;
    }
    if (lines.length < maxLines && line) lines.push(line);
    if (lines.length === maxLines && ctx.measureText(lines[maxLines - 1]).width > maxW - 20) lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + '…';
    return lines;
  };

  // テンプレートのページを PNG（data URL）で返す
  async function templates(plan, { blankPages = 1 } = {}) {
    await document.fonts.load(`40px ${FONT}`).catch(() => {});
    const aspect = ASPECT_KEYS.includes(plan.aspect) ? plan.aspect : '16:9';
    const n = perPage(aspect);
    const cuts = plan.cuts || [];
    const pages = Math.max(cuts.length ? Math.ceil(cuts.length / n) : blankPages, 1);
    const fr = frames(aspect);
    const out = [];
    let start = 0;
    for (let p = 0; p < pages; p++) {
      const cv = Object.assign(document.createElement('canvas'), { width: W, height: H });
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#222';
      ctx.font = `600 64px ${FONT}`;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(plan.title || '絵コンテ', M, 140);
      ctx.font = `36px ${FONT}`;
      ctx.fillStyle = '#888';
      ctx.textAlign = 'right';
      ctx.fillText(`${aspect}   ${p + 1} / ${pages}`, W - M, 140);
      ctx.textAlign = 'left';
      fr.forEach((f, i) => {
        const k = p * n + i;
        const cut = cuts[k];
        // 枠はコマの外側に描くので、切り抜いた絵に線は入らない
        ctx.strokeStyle = '#9a9a9a';
        ctx.lineWidth = 4;
        ctx.strokeRect(f.x - 4, f.y - 4, f.w + 8, f.h + 8);
        ctx.fillStyle = '#222';
        ctx.font = `600 38px ${FONT}`;
        ctx.fillText(String(k + 1), f.x, f.y - 18);
        if (cut) {
          const s = start;
          start += Number(cut.dur) || 0;
          ctx.font = `30px ${FONT}`;
          ctx.fillStyle = '#888';
          ctx.textAlign = 'right';
          ctx.fillText(`${cut.dur ?? ''}秒  ${window.planDoc.tc(s)}–${window.planDoc.tc(start)}`, f.x + f.w, f.y - 18);
          ctx.textAlign = 'left';
          ctx.font = `28px ${FONT}`;
          ctx.fillStyle = '#555';
          wrap(ctx, cut.note, f.w, 3).forEach((l, j) => ctx.fillText(l, f.x, f.y + f.h + 42 + j * 36));
        }
      });
      encode(aspect, p).forEach((b, i) => {
        const { x, y } = markAt(i);
        ctx.fillStyle = b ? '#000' : '#fff';
        ctx.fillRect(x, y, SQ, SQ);
        ctx.strokeStyle = '#bbb';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, SQ, SQ);
      });
      out.push({ name: `${String(p + 1).padStart(2, '0')}_${(plan.title || '絵コンテ').replace(/[\\/:*?"<>|]/g, '')}.png`, dataUrl: cv.toDataURL('image/png') });
    }
    return out;
  }

  const loadImage = (blob) => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('画像を読めませんでした')); };
    img.src = url;
  });

  // 書き出した画像を読む。テンプレートの印がなければ null（ふつうの1枚の絵として扱う）
  async function split(blob) {
    const img = await loadImage(blob);
    if (Math.abs(img.width / img.height - W / H) > 0.02) return null;
    const k = img.width / W;
    const cv = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height });
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const bits = Array.from({ length: BITS }, (_, i) => {
      const { x, y } = markAt(i);
      const d = ctx.getImageData(Math.round((x + SQ / 2) * k), Math.round((y + SQ / 2) * k), 1, 1).data;
      return (d[0] + d[1] + d[2]) / 3 < 110 ? 1 : 0;
    });
    if (bits.slice(0, -1).reduce((a, b) => a ^ b, 0) !== bits[BITS - 1]) return null;
    const v = bits.slice(0, -1).reduce((a, b, i) => a | (b << i), 0);
    const aspect = ASPECT_KEYS[v & 7];
    if (!aspect) return null;
    const page = v >> 3;
    const crops = frames(aspect).map((f) => {
      const inset = Math.round(Math.min(f.w, f.h) * 0.006);
      const sx = Math.round((f.x + inset) * k);
      const sy = Math.round((f.y + inset) * k);
      const sw = Math.round((f.w - 2 * inset) * k);
      const sh = Math.round((f.h - 2 * inset) * k);
      // 何も描かれていないコマは飛ばす（そのカットの絵はそのまま）
      const data = ctx.getImageData(sx, sy, sw, sh).data;
      let ink = 0;
      let seen = 0;
      for (let i = 0; i < data.length; i += 4 * 7) {
        seen++;
        if (data[i + 3] > 20 && (data[i] + data[i + 1] + data[i + 2]) / 3 < 235) ink++;
      }
      if (ink / seen < 0.002) return null;
      const out = Object.assign(document.createElement('canvas'), { width: sw, height: sh });
      const o = out.getContext('2d');
      o.fillStyle = '#fff';
      o.fillRect(0, 0, sw, sh);
      o.drawImage(cv, sx, sy, sw, sh, 0, 0, sw, sh);
      return out.toDataURL('image/png');
    });
    return { aspect, page, crops, perPage: perPage(aspect) };
  }

  root.procreate = { templates, split, perPage, frames, W, H };
})(window);
