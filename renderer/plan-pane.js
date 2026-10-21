// 企画書（リファレンス集め→構成→推敲→デザインを一気に）と絵コンテ
const fileUrl = (p) => `file://${String(p).split('/').map(encodeURIComponent).join('/')}`;
const readAsDataUrl = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

const PLAN_STEPS = [
  { id: 'refs', label: 'リファレンス集め' },
  { id: 'structure', label: '構成と本文' },
  { id: 'polish', label: '推敲' },
  { id: 'design', label: 'デザイン' },
];

function planPane() {
  const { THEMES, ASPECTS, tc, totalDur } = window.planDoc;
  const pane = el('section', 'pane plan');
  pane.innerHTML = `<aside class="inv-list pl-list"><button type="button" class="primary new">＋ 新しい企画</button><ul></ul></aside>
    <div class="pl-main">
      <div class="pl-top">
        <input class="pl-title" data-f="title" placeholder="企画タイトル">
        <div class="tabs"><button type="button" data-tab="pl-doc" class="on">📝 企画書</button><button type="button" data-tab="pl-board">🎞 絵コンテ</button></div>
        <span class="status"></span><button type="button" class="del">削除</button>
      </div>
      <div class="pl-tab pl-doc on">
        <div class="pl-edit">
          <label>企画メモ<textarea data-f="memo" rows="4" placeholder="例：ヨルシカ新曲のMV。夏の終わり、海辺の町。予算300万、尺4分、10月末納品。"></textarea></label>
          <div class="pl-run">
            <button type="button" class="primary go">✨ 一気に仕上げる</button>
            <span class="checks">${PLAN_STEPS.map((s) => `<label><input type="checkbox" value="${s.id}" checked>${s.label}</label>`).join('')}</span>
          </div>
          <ol class="steps"></ol>
          <h4>リファレンス</h4>
          <ul class="refs"></ul>
          <div class="row addref"><input placeholder="URL か作品名を追加"><button type="button">追加</button></div>
          <h4>本文</h4>
          <div class="grid">
            <label class="wide">サブタイトル<input data-f="subtitle"></label>
            <label class="wide">キャッチコピー<input data-f="tagline"></label>
            <label>デザイン<select data-f="theme">${Object.entries(THEMES).map(([k, t]) => `<option value="${k}">${t.name}</option>`).join('')}</select></label>
            <label>差し色<input type="color" data-f="accent"></label>
          </div>
          <div class="sections"></div>
          <button type="button" class="add-section">＋ 章を追加</button>
          <div class="actions"><button type="button" class="primary pdf">企画書をPDFに書き出す</button><label class="check"><input type="checkbox" class="with-sb">絵コンテも付ける</label></div>
        </div>
        <div class="pl-preview"><div class="paper"></div></div>
      </div>
      <div class="pl-tab pl-board">
        <div class="sb-tools">
          <label>画面比<select data-f="aspect">${Object.keys(ASPECTS).map((k) => `<option>${k}</option>`).join('')}</select></label>
          <label>全体の尺<input type="number" data-f="seconds" min="0" step="1" class="num">秒</label>
          <button type="button" class="ai-cuts">✨ 企画書からカット割り</button>
          <button type="button" class="add-cut">＋ カット</button>
          <span class="total"></span>
          <span class="spacer"></span>
          <label>白紙<input type="number" class="blank-pages num" value="2" min="1" max="20">ページ</label>
          <button type="button" class="blank-pdf">テンプレートをPDF</button>
          <button type="button" class="primary sb-pdf">絵コンテをPDF</button>
        </div>
        <div class="sb-msg"></div>
        <div class="sb-head"><span></span><span>No</span><span>尺</span><span>画面</span><span>ト書き</span><span></span></div>
        <ol class="cuts"></ol>
        <p class="hint">描いた絵は画面の枠にドラッグ＆ドロップ（何枚かまとめて落とすと後ろのカットに順にはまります）、クリックで選ぶ、コピーして枠を選んで ⌘V、✏️ でその場で描くこともできます。左の ⋮⋮ をドラッグすると並べ替えられます。</p>
      </div>
    </div>
    <dialog class="sketch">
      <div class="sk-tools">
        <button type="button" data-color="#111" class="on">黒</button><button type="button" data-color="#888">灰</button><button type="button" data-color="#d33">赤</button><button type="button" data-color="#2a6fdb">青</button><button type="button" data-color="eraser">消しゴム</button>
        <label>太さ<input type="range" min="1" max="30" value="6" class="size"></label>
        <button type="button" class="undo">↶ 戻す</button><button type="button" class="clear">全部消す</button>
        <span class="spacer"></span><button type="button" class="cancel">やめる</button><button type="button" class="primary ok">はめる</button>
      </div>
      <canvas></canvas>
    </dialog>`;
  const $ = (q) => pane.querySelector(q);
  const status = $('.status');
  let all = [];
  let plan;
  let saveTimer;

  const blank = () => ({ id: crypto.randomUUID(), date: today(), title: '', memo: '', refs: [], subtitle: '', tagline: '', sections: [], theme: 'clean', accent: '#e8453c', aspect: '16:9', seconds: 30, cuts: [] });

  // 変更はすぐ自動で保存する
  const persist = async () => {
    clearTimeout(saveTimer);
    all = await window.hub.plans.save(plan);
    renderList();
    status.textContent = '保存しました';
  };
  const changed = () => { status.textContent = ''; clearTimeout(saveTimer); saveTimer = setTimeout(persist, 600); };

  const preview = () => {
    $('.paper').innerHTML = window.planDoc.proposalHtml(plan);
  };

  // ---- 一覧
  const renderList = () => {
    const ul = $('.pl-list ul');
    ul.textContent = '';
    for (const x of [...all].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))) {
      const li = el('li');
      li.dataset.id = x.id;
      li.classList.toggle('active', x.id === plan?.id);
      li.append(el('b', null, x.title || '無題の企画'), el('span', null, `${(x.sections || []).length}章・${(x.cuts || []).length}カット`));
      li.onclick = async () => { await flush(); plan = structuredClone(x); $('.steps').textContent = ''; fill(); };
      ul.append(li);
    }
  };
  const flush = async () => { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; if (plan) await persist(); } };

  // ---- 企画書
  const renderRefs = () => {
    const ul = $('.refs');
    ul.textContent = '';
    plan.refs.forEach((r, i) => {
      const li = el('li');
      const t = el(r.url ? 'a' : 'b', null, r.title || r.url);
      if (r.url) { t.href = '#'; t.title = r.url; t.onclick = (e) => { e.preventDefault(); window.hub.openUrl(r.url); }; }
      const note = el('input');
      note.value = r.note || '';
      note.placeholder = 'どこを参考にするか';
      note.oninput = () => { r.note = note.value; preview(); changed(); };
      const x = el('button', 'x', '×');
      x.type = 'button';
      x.title = '外す';
      x.onclick = () => { plan.refs.splice(i, 1); renderRefs(); preview(); changed(); };
      li.append(el('div', 'ref-head'), note);
      li.firstChild.append(t, el('span', 'src', r.source || ''), x);
      ul.append(li);
    });
  };

  const renderSections = () => {
    const box = $('.sections');
    box.textContent = '';
    plan.sections.forEach((s, i) => {
      const card = el('div', 'section-card');
      const h = el('input');
      h.value = s.heading;
      h.placeholder = '章タイトル';
      const b = el('textarea');
      b.value = s.body;
      b.rows = Math.min(10, Math.max(3, s.body.split('\n').length + 1));
      b.placeholder = '本文（行頭に「・」で箇条書き）';
      h.oninput = () => { s.heading = h.value; preview(); changed(); };
      b.oninput = () => { s.body = b.value; preview(); changed(); };
      const tools = el('div', 'sec-tools');
      const btn = (label, title, fn) => { const x = el('button', null, label); x.type = 'button'; x.title = title; x.onclick = fn; tools.append(x); };
      btn('↑', '上へ', () => { if (i) { plan.sections.splice(i - 1, 0, plan.sections.splice(i, 1)[0]); renderSections(); preview(); changed(); } });
      btn('↓', '下へ', () => { if (i < plan.sections.length - 1) { plan.sections.splice(i + 1, 0, plan.sections.splice(i, 1)[0]); renderSections(); preview(); changed(); } });
      btn('×', '章を消す', () => { plan.sections.splice(i, 1); renderSections(); preview(); changed(); });
      card.append(el('div', 'sec-head'), b);
      card.firstChild.append(el('span', 'sec-no', String(i + 1).padStart(2, '0')), h, tools);
      box.append(card);
    });
  };

  const fill = () => {
    for (const input of pane.querySelectorAll('[data-f]')) input.value = plan[input.dataset.f] ?? '';
    renderRefs();
    renderSections();
    renderCuts();
    preview();
    renderList();
  };

  for (const input of pane.querySelectorAll('[data-f]')) {
    input.addEventListener('input', () => {
      plan[input.dataset.f] = input.type === 'number' ? Number(input.value) : input.value;
      if (input.dataset.f === 'aspect') renderCuts();
      preview();
      changed();
    });
  }

  $('.addref button').onclick = () => {
    const input = $('.addref input');
    const v = input.value.trim();
    if (!v) return;
    plan.refs.push(/^https?:\/\//.test(v) ? { title: v.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60), url: v, source: '', note: '' } : { title: v, url: '', source: '', note: '' });
    input.value = '';
    renderRefs(); preview(); changed();
  };
  $('.addref input').onkeydown = (e) => { if (e.key === 'Enter') $('.addref button').click(); };
  $('.add-section').onclick = () => { plan.sections.push({ heading: '', body: '' }); renderSections(); preview(); changed(); };

  // 選んだ工程を順番に AI に頼む
  $('.go').onclick = async () => {
    const steps = PLAN_STEPS.filter((s) => pane.querySelector(`.checks input[value=${s.id}]`).checked);
    const ol = $('.steps');
    if (!plan.memo.trim() && !plan.sections.length) { ol.innerHTML = '<li class="err">先に企画メモを書いてください</li>'; return; }
    ol.textContent = '';
    const items = steps.map((s) => { const li = el('li', null, `○ ${s.label}`); ol.append(li); return li; });
    $('.go').disabled = true;
    try {
      for (const [i, s] of steps.entries()) {
        items[i].textContent = `✱ ${s.label}中…`;
        items[i].className = 'now';
        const out = await window.hub.plans.step(plan, s.id);
        if (s.id === 'refs') {
          const seen = new Set(plan.refs.map((r) => r.url || r.title));
          plan.refs.push(...out.refs.filter((r) => !seen.has(r.url || r.title)));
        } else {
          for (const [k, v] of Object.entries(out)) if (v !== '' && !(Array.isArray(v) && !v.length)) plan[k] = v;
        }
        fill();
        await persist();
        items.forEach((li, j) => { if (j <= i) { li.textContent = `✓ ${steps[j].label}`; li.className = 'done'; } else li.textContent = `○ ${steps[j].label}`; });
      }
    } catch (e) {
      const li = ol.querySelector('.now');
      if (li) { li.textContent = `× ${li.textContent.slice(2).replace('中…', '')}：${e.message.replace(/^.*Error: /, '')}`; li.className = 'err'; }
    } finally {
      $('.go').disabled = false;
    }
  };

  const exportPdf = async (kind, opts) => {
    await flush();
    const msg = kind === 'proposal' ? status : $('.sb-msg');
    try {
      const out = await window.hub.plans.pdf(plan, kind, opts);
      if (out) { msg.textContent = `PDFを書き出しました：${out}`; msg.classList.remove('err'); }
    } catch (e) { msg.textContent = `書き出せませんでした：${e.message.replace(/^.*Error: /, '')}`; msg.classList.add('err'); }
  };
  $('.pdf').onclick = () => exportPdf('proposal', { withStoryboard: $('.with-sb').checked });
  $('.sb-pdf').onclick = () => exportPdf('storyboard');
  $('.blank-pdf').onclick = () => exportPdf('blank', { pages: Number($('.blank-pages').value) || 2 });

  // ---- 絵コンテ
  const setImage = async (cut, blob) => {
    cut.image = await window.hub.plans.saveImage(plan.id, await readAsDataUrl(blob));
  };
  // 何枚か落としたら、そのカットから順にはめる（足りなければカットを足す）
  const dropImages = async (index, files) => {
    const images = [...files].filter((f) => f.type.startsWith('image/'));
    for (const [k, f] of images.entries()) {
      if (!plan.cuts[index + k]) plan.cuts.push({ id: crypto.randomUUID(), dur: 3, note: '' });
      await setImage(plan.cuts[index + k], f);
    }
    if (images.length) { renderCuts(); changed(); }
  };

  let dragFrom = null;
  const renderCuts = () => {
    const ol = $('.cuts');
    ol.textContent = '';
    const ratio = ASPECTS[plan.aspect] ?? 16 / 9;
    pane.querySelector('.pl-board').style.setProperty('--fw', `${Math.round(Math.min(ratio * 160, 320))}px`);
    let start = 0;
    plan.cuts.forEach((cut, i) => {
      const li = el('li', 'cut');
      const s = start;
      start += Number(cut.dur) || 0;
      const grip = el('span', 'grip', '⋮⋮');
      grip.title = 'ドラッグで並べ替え';
      grip.draggable = true;
      grip.ondragstart = (e) => { dragFrom = i; e.dataTransfer.setData('text/x-cut', String(i)); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setDragImage(li, 20, 20); li.classList.add('dragging'); };
      grip.ondragend = () => { li.classList.remove('dragging'); dragFrom = null; };
      li.ondragover = (e) => { if (dragFrom !== null) { e.preventDefault(); li.classList.add('over'); } };
      li.ondragleave = () => li.classList.remove('over');
      li.ondrop = (e) => {
        if (dragFrom === null) return;
        e.preventDefault();
        const [moved] = plan.cuts.splice(dragFrom, 1);
        plan.cuts.splice(i, 0, moved);
        dragFrom = null;
        renderCuts(); changed();
      };

      const dur = el('div', 'dur');
      const din = el('input');
      din.type = 'number'; din.min = '0'; din.step = '0.5'; din.value = cut.dur ?? '';
      din.oninput = () => { cut.dur = Number(din.value); updateTimes(); changed(); };
      dur.append(din, el('span', 'unit', '秒'), el('small', 'tc', `${tc(s)}–${tc(start)}`));

      const frame = el('div', 'frame');
      frame.tabIndex = 0;
      frame.style.aspectRatio = String(ratio);
      if (cut.image) frame.append(Object.assign(el('img'), { src: fileUrl(cut.image), draggable: false }));
      else frame.append(el('span', 'ph', '絵をドロップ\nまたはクリック'));
      const picker = Object.assign(el('input'), { type: 'file', accept: 'image/*', multiple: true, hidden: true });
      picker.onchange = () => dropImages(i, picker.files);
      frame.onclick = (e) => { if (e.target === frame || e.target.classList.contains('ph') || e.target.tagName === 'IMG') picker.click(); };
      frame.ondragover = (e) => { if (dragFrom === null && e.dataTransfer.types.includes('Files')) { e.preventDefault(); frame.classList.add('over'); } };
      frame.ondragleave = () => frame.classList.remove('over');
      frame.ondrop = (e) => { if (dragFrom !== null) return; e.preventDefault(); e.stopPropagation(); frame.classList.remove('over'); dropImages(i, e.dataTransfer.files); };
      frame.onpaste = (e) => {
        const f = [...e.clipboardData.items].find((x) => x.type.startsWith('image/'))?.getAsFile();
        if (f) { e.preventDefault(); dropImages(i, [f]); }
      };
      const ft = el('div', 'frame-tools');
      const fbtn = (label, title, fn) => { const x = el('button', null, label); x.type = 'button'; x.title = title; x.onclick = (e) => { e.stopPropagation(); fn(); }; ft.append(x); };
      fbtn('✏️', 'ここに描く', () => openSketch(cut));
      if (cut.image) fbtn('×', '絵を外す', () => { delete cut.image; renderCuts(); changed(); });
      frame.append(ft, picker);

      const note = el('textarea', 'note');
      note.value = cut.note ?? '';
      note.placeholder = 'ト書き（画面・カメラ・セリフ・音）';
      note.oninput = () => { cut.note = note.value; changed(); };

      const tools = el('div', 'cut-tools');
      const btn = (label, title, fn) => { const x = el('button', null, label); x.type = 'button'; x.title = title; x.onclick = fn; tools.append(x); };
      btn('↑', '上へ', () => { if (i) { plan.cuts.splice(i - 1, 0, plan.cuts.splice(i, 1)[0]); renderCuts(); changed(); } });
      btn('↓', '下へ', () => { if (i < plan.cuts.length - 1) { plan.cuts.splice(i + 1, 0, plan.cuts.splice(i, 1)[0]); renderCuts(); changed(); } });
      btn('⧉', '複製', () => { plan.cuts.splice(i + 1, 0, { ...structuredClone(cut), id: crypto.randomUUID() }); renderCuts(); changed(); });
      btn('×', 'カットを消す', () => { plan.cuts.splice(i, 1); renderCuts(); changed(); });

      li.append(grip, el('span', 'no', String(i + 1)), dur, frame, note, tools);
      ol.append(li);
    });
    updateTimes();
  };
  const updateTimes = () => {
    let start = 0;
    pane.querySelectorAll('.cut').forEach((li, i) => {
      const s = start;
      start += Number(plan.cuts[i]?.dur) || 0;
      li.querySelector('.tc').textContent = `${tc(s)}–${tc(start)}`;
    });
    const total = totalDur(plan.cuts);
    $('.total').textContent = `${plan.cuts.length}カット・合計 ${tc(total)}${plan.seconds ? `（目安 ${tc(plan.seconds)}）` : ''}`;
    $('.total').classList.toggle('over', Boolean(plan.seconds) && total > plan.seconds);
  };

  // 枠の外に落とした絵は、後ろに新しいカットとして足す（ウィンドウがファイルを開いてしまわないように止める）
  pane.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
  pane.addEventListener('drop', (e) => {
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    if ($('.pl-tab.pl-board').classList.contains('on')) dropImages(plan.cuts.length, e.dataTransfer.files);
  });

  $('.add-cut').onclick = () => { plan.cuts.push({ id: crypto.randomUUID(), dur: 3, note: '' }); renderCuts(); changed(); };
  $('.ai-cuts').onclick = async () => {
    const msg = $('.sb-msg');
    msg.classList.remove('err');
    if (!plan.sections.length && !plan.memo.trim()) { msg.textContent = '先に企画書かメモを書いてください'; msg.classList.add('err'); return; }
    if (plan.cuts.length && !confirm('今のカット割りを置き換えます。はめた絵は順番どおりに残します。')) return;
    msg.textContent = 'Claudeがカット割り中…';
    try {
      const { cuts } = await window.hub.plans.step(plan, 'cuts', { seconds: plan.seconds });
      const images = plan.cuts.map((c) => c.image).filter(Boolean);
      cuts.forEach((c, k) => { if (images[k]) c.image = images[k]; });
      plan.cuts = cuts;
      renderCuts();
      await persist();
      msg.textContent = `${cuts.length}カットに割りました。尺とト書きを直して、絵をはめてください。`;
    } catch (e) { msg.textContent = `うまくいきませんでした：${e.message.replace(/^.*Error: /, '')}`; msg.classList.add('err'); }
  };

  // ---- その場で描く
  const dlg = $('.sketch');
  const canvas = dlg.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  let sketchCut = null;
  let color = '#111';
  let undo = [];
  const openSketch = async (cut) => {
    sketchCut = cut;
    const ratio = ASPECTS[plan.aspect] ?? 16 / 9;
    canvas.width = ratio >= 1 ? 1280 : Math.round(1280 * ratio);
    canvas.height = Math.round(canvas.width / ratio);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (cut.image) {
      const img = new Image();
      img.src = fileUrl(cut.image);
      await img.decode().catch(() => {});
      const k = Math.max(canvas.width / img.width, canvas.height / img.height);
      ctx.drawImage(img, (canvas.width - img.width * k) / 2, (canvas.height - img.height * k) / 2, img.width * k, img.height * k);
    }
    undo = [];
    dlg.showModal();
  };
  for (const b of dlg.querySelectorAll('[data-color]')) {
    b.onclick = () => { color = b.dataset.color; dlg.querySelectorAll('[data-color]').forEach((x) => x.classList.toggle('on', x === b)); };
  }
  let drawing = false;
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * canvas.width / r.width, (e.clientY - r.top) * canvas.height / r.height]; };
  canvas.onpointerdown = (e) => {
    drawing = true;
    canvas.setPointerCapture(e.pointerId);
    undo.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (undo.length > 30) undo.shift();
    ctx.strokeStyle = color === 'eraser' ? '#fff' : color;
    ctx.lineWidth = Number(dlg.querySelector('.size').value) * (color === 'eraser' ? 4 : 1) * (e.pressure && e.pointerType === 'pen' ? e.pressure * 2 : 1);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(...pos(e));
  };
  canvas.onpointermove = (e) => { if (!drawing) return; ctx.lineTo(...pos(e)); ctx.stroke(); };
  canvas.onpointerup = () => { drawing = false; };
  dlg.querySelector('.undo').onclick = () => { const d = undo.pop(); if (d) ctx.putImageData(d, 0, 0); };
  dlg.querySelector('.clear').onclick = () => { undo.push(ctx.getImageData(0, 0, canvas.width, canvas.height)); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); };
  dlg.querySelector('.cancel').onclick = () => dlg.close();
  dlg.querySelector('.ok').onclick = async () => {
    sketchCut.image = await window.hub.plans.saveImage(plan.id, canvas.toDataURL('image/png'));
    dlg.close();
    renderCuts();
    changed();
  };

  // ---- タブ・新規・削除
  for (const b of pane.querySelectorAll('.tabs button')) {
    b.onclick = () => {
      pane.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
      pane.querySelectorAll('.pl-tab').forEach((t) => t.classList.toggle('on', t.classList.contains(b.dataset.tab)));
    };
  }
  $('.new').onclick = async () => { await flush(); plan = blank(); $('.steps').textContent = ''; fill(); };
  $('.del').onclick = async () => {
    clearTimeout(saveTimer); saveTimer = null;
    if (all.some((x) => x.id === plan.id)) {
      if (!confirm(`「${plan.title || '無題の企画'}」を削除しますか？はめた絵も消えます。`)) return;
      all = await window.hub.plans.remove(plan.id);
    }
    plan = blank();
    fill();
  };

  (async () => {
    all = await window.hub.plans.list();
    plan = all.length ? structuredClone([...all].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))[0]) : blank();
    fill();
  })();
  return pane;
}
