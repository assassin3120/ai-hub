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
  { id: 'board', label: '絵コンテ' },
];

function planPane() {
  const { THEMES, ASPECTS, tc, totalDur } = window.planDoc;
  const pane = el('section', 'pane plan');
  pane.innerHTML = `<aside class="inv-list pl-list"><button type="button" class="primary new">＋ 新しい企画</button><ul></ul></aside>
    <div class="pl-main">
      <div class="pl-top">
        <input class="pl-title" data-f="title" placeholder="企画タイトル">
        <div class="tabs"><button type="button" data-tab="pl-doc" class="on">📝 企画書</button><button type="button" data-tab="pl-board">🎞 絵コンテ</button></div>
        <span class="status"></span><button type="button" class="theme-btn"></button><button type="button" class="clear" title="この企画に書いた内容（企画書・リファレンス・篇・カット・絵）を全部消して、白紙に戻します">クリアする</button><button type="button" class="undo-clear" hidden>元に戻す</button><button type="button" class="del">削除</button>
      </div>
      <div class="pl-tab pl-doc on">
        <div class="pl-edit">
          <label>企画メモ<textarea data-f="memo" rows="4" placeholder="例：ヨルシカ新曲のMV。夏の終わり、海辺の町。予算300万、尺4分、10月末納品。&#10;企画書のファイル（PDF・Word・テキスト）をここにドロップすると、読み込んで絵コンテまで一気に作ります。"></textarea></label>
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
            <label>デザイン<select data-f="theme">${Object.entries(THEMES).map(([k, t]) => `<option value="${k}">${t.name}</option>`).join('')}<option value="custom">トンマナ</option></select></label>
            <label>差し色<input type="color" data-f="accent"></label>
          </div>
          <div class="tone">
            <b>雰囲気からトンマナを作る</b>
            <div class="drop" tabindex="0"><span class="drop-hint">参考画像をドロップ／クリックで選ぶ／⌘Vで貼る</span></div>
            <textarea class="tone-words" placeholder="言葉でも：例）90年代の雑誌みたいに。黄色と黒、太いゴシック、ずらした影"></textarea>
            <div class="pl-run"><button type="button" class="primary tone-go">✨ この雰囲気にする</button><span class="swatches"></span></div>
            <div class="tone-note"></div>
            <input type="file" class="tone-file" accept="image/*" multiple hidden>
          </div>
          <div class="sections"></div>
          <button type="button" class="add-section">＋ 章を追加</button>
          <div class="actions"><button type="button" class="primary pdf">企画書をPDFに書き出す</button><label class="check"><input type="checkbox" class="with-sb">絵コンテも付ける</label></div>
        </div>
        <div class="pl-preview"><div class="paper"></div></div>
      </div>
      <div class="pl-tab pl-board">
        <div class="eps">
          <div class="ep-tabs"></div>
          <button type="button" class="ep-add" title="新しい篇を足す">＋ 篇</button>
          <span class="spacer"></span>
          <label>篇の名前<input class="ep-name" placeholder="例：A篇・夏篇・15秒版"></label>
          <button type="button" class="ep-dup" title="この篇をまるごと複製">複製</button>
          <button type="button" class="ep-del" title="この篇を消す">篇を消す</button>
        </div>
        <div class="sb-tools">
          <label>画面比<select data-f="aspect">${Object.keys(ASPECTS).map((k) => `<option>${k}</option>`).join('')}</select></label>
          <label>全体の尺<input type="number" data-f="seconds" min="0" step="1" class="num">秒</label>
          <button type="button" class="ai-cuts">✨ 企画書からカット割り</button>
          <button type="button" class="add-cut">＋ カット</button>
          <span class="total"></span>
          <span class="spacer"></span>
          <label>白紙<input type="number" class="blank-pages num" value="2" min="1" max="20">ページ</label>
          <button type="button" class="blank-pdf">テンプレートをPDF</button>
          <button type="button" class="pc-template" title="iPad の Procreate で描くための PNG（2732×2048）を書き出します">Procreate用テンプレート</button>
          <button type="button" class="pc-import" title="Procreate で描いて書き出した画像を読み込み、コマごとに切り分けてはめます">Procreateから読み込む</button>
          <input type="file" class="pc-files" accept="image/*" multiple hidden>
          <label>書き出し<select class="sb-kind">
            <option value="storyboard">表（No・尺・画面・ト書き）</option>
            <option value="contact">コンタクトシート</option>
            <option value="cascade">CMコンテ（ずらし組み・吹き出し）</option>
          </select></label>
          <label class="check ep-all-wrap"><input type="checkbox" class="ep-all">全篇まとめて</label>
          <button type="button" class="primary sb-pdf">絵コンテをPDF</button>
        </div>
        <div class="sb-msg"></div>
        <div class="sb-head"><span></span><span>No</span><span>尺</span><span>画面</span><span>ト書き・セリフ</span><span></span></div>
        <ol class="cuts"></ol>
        <p class="hint">描いた絵は画面の枠にドラッグ＆ドロップ（何枚かまとめて落とすと後ろのカットに順にはまります）、クリックで選ぶ、コピーして枠を選んで ⌘V、✏️ でその場で描くこともできます。カットは行のどこでも（絵の上でも）つかんでドラッグすると並べ替えられます。<br>Procreate で描くなら「Procreate用テンプレート」を書き出して iPad に送り、描いたら画像（PNG / JPEG）で書き出して「Procreateから読み込む」かここにドロップ。ページの順番は気にせず、まとめて入れれば各コマに自動ではまります。</p>
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

  const blank = () => ({ id: crypto.randomUUID(), date: today(), title: '', memo: '', refs: [], subtitle: '', tagline: '', sections: [], theme: 'clean', accent: '#e8453c', tone: { images: [], words: '' }, aspect: '16:9', seconds: 30, cuts: [] });

  // ---- 篇（A篇・B篇…）。篇ごとに画面比・尺・カットを持つ。
  // 開いている篇の値は plan.aspect / seconds / cuts にも置いて、ほかのコードはそのまま使う
  const EP_FIELDS = ['aspect', 'seconds', 'cuts'];
  const newEp = (name, from = {}) => ({ id: crypto.randomUUID(), name, aspect: from.aspect || '16:9', seconds: from.seconds ?? 30, cuts: from.cuts || [] });
  const curEp = () => plan.episodes.find((e) => e.id === plan.ep) ?? plan.episodes[0];
  const syncEp = () => { const ep = curEp(); for (const k of EP_FIELDS) ep[k] = plan[k]; };
  const loadEp = (id) => { plan.ep = id; const ep = curEp(); plan.ep = ep.id; for (const k of EP_FIELDS) plan[k] = ep[k]; };
  // 篇がない（前に作った）企画は、今のカットを「本編」にする
  const withEps = (p) => {
    plan = p;
    if (!Array.isArray(plan.episodes) || !plan.episodes.length) plan.episodes = [newEp('本編', plan)];
    loadEp(plan.ep);
    return plan;
  };

  // 変更はすぐ自動で保存する
  const persist = async () => {
    clearTimeout(saveTimer);
    syncEp();
    all = await window.hub.plans.save(plan);
    renderList();
    status.textContent = '保存しました';
  };
  let beforeClear = null; // クリアする前の企画（元に戻す用）
  const changed = () => { if (beforeClear) hideUndo(); status.textContent = ''; clearTimeout(saveTimer); saveTimer = setTimeout(persist, 600); };

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
      const eps = x.episodes?.length ? x.episodes : [{ cuts: x.cuts || [] }];
      const cutCount = eps.reduce((n, e) => n + (e.cuts || []).length, 0);
      li.append(el('b', null, x.title || '無題の企画'), el('span', null, `${(x.sections || []).length}章・${eps.length > 1 ? `${eps.length}篇・` : ''}${cutCount}カット`));
      li.onclick = async () => { hideUndo(); await flush(); withEps(structuredClone(x)); $('.steps').textContent = ''; fill(); };
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

  // ---- トンマナ
  const renderTone = () => {
    plan.tone ??= { images: [], words: '' };
    const drop = $('.tone .drop');
    drop.querySelectorAll('.shot').forEach((x) => x.remove());
    $('.drop-hint').hidden = plan.tone.images.length > 0;
    plan.tone.images.forEach((p, i) => {
      const shot = el('span', 'shot');
      const x = el('button', null, '×');
      x.type = 'button';
      x.title = '外す';
      x.onclick = (e) => { e.stopPropagation(); plan.tone.images.splice(i, 1); renderTone(); changed(); };
      shot.append(Object.assign(el('img'), { src: fileUrl(p), draggable: false }), x);
      drop.append(shot);
    });
    $('.tone-words').value = plan.tone.words || '';
    const sw = $('.tone .swatches');
    sw.textContent = '';
    const ct = plan.customTheme;
    if (ct) {
      sw.append(el('span', null, ct.name));
      for (const c of [ct.bg, ct.ink, ct.cover, ct.accent, ct.accent2]) { const i = el('i'); i.style.background = c; i.title = c; sw.append(i); }
    }
    const opt = $('select[data-f=theme] option[value=custom]');
    opt.textContent = ct ? `トンマナ：${ct.name}` : 'トンマナ（未作成）';
    opt.disabled = !ct;
    $('.tone-note').textContent = ct?.note || '';
  };
  const addToneImages = async (files) => {
    const images = [...files].filter((f) => f.type.startsWith('image/'));
    for (const f of images) plan.tone.images.push(await window.hub.plans.saveImage(plan.id, await readAsDataUrl(f)));
    if (images.length) { renderTone(); changed(); }
  };
  const drop = $('.tone .drop');
  drop.onclick = () => $('.tone-file').click();
  drop.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('.tone-file').click(); } };
  $('.tone-file').onchange = async (e) => { await addToneImages(e.target.files); e.target.value = ''; };
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); addToneImages(e.dataTransfer.files); };
  drop.onpaste = (e) => { const files = [...e.clipboardData.items].map((it) => it.getAsFile()).filter(Boolean); if (files.length) { e.preventDefault(); addToneImages(files); } };
  $('.tone-words').oninput = (e) => { plan.tone.words = e.target.value; changed(); };
  $('.tone-go').onclick = async () => {
    const note = $('.tone-note');
    if (!plan.tone.images.length && !plan.tone.words.trim()) { note.textContent = '参考画像か、雰囲気を表す言葉を入れてください'; return; }
    $('.tone-go').disabled = true;
    note.textContent = '✱ 雰囲気を読み取っています…';
    try {
      await flush();
      Object.assign(plan, await window.hub.plans.step(plan, 'tone'));
      fill();
      await persist();
      note.textContent = plan.customTheme.note || 'トンマナを作りました';
    } catch (e) {
      note.textContent = `× 作れませんでした：${e.message.replace(/^.*Error: /, '')}`;
    } finally {
      $('.tone-go').disabled = false;
    }
  };

  const fill = () => {
    renderEps();
    renderTone();
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
        // 雰囲気から作ったトンマナを使っているときは、デザインを選び直さない
        if (s.id === 'design' && plan.theme === 'custom' && plan.customTheme) {
          items[i].textContent = `✓ ${s.label}（トンマナを使用）`; items[i].className = 'done'; continue;
        }
        const out = await window.hub.plans.step(plan, s.id);
        if (s.id === 'board') {
          const note = mergeBoard(out.episodes);
          fill();
          await persist();
          items[i].dataset.note = note;
          continue;
        }
        if (s.id === 'refs') {
          const seen = new Set(plan.refs.map((r) => r.url || r.title));
          plan.refs.push(...out.refs.filter((r) => !seen.has(r.url || r.title)));
        } else {
          for (const [k, v] of Object.entries(out)) if (v !== '' && !(Array.isArray(v) && !v.length)) plan[k] = v;
        }
        fill();
        await persist();
        items.forEach((li, j) => { if (j <= i) { li.textContent = `✓ ${steps[j].label}${li.dataset.note ? `（${li.dataset.note}）` : ''}`; li.className = 'done'; } else li.textContent = `○ ${steps[j].label}`; });
      }
      const b = steps.findIndex((x) => x.id === 'board');
      if (b >= 0 && items[b].className === 'now') { items[b].textContent = `✓ 絵コンテ（${items[b].dataset.note}）`; items[b].className = 'done'; }
    } catch (e) {
      const li = ol.querySelector('.now');
      if (li) { li.textContent = `× ${li.textContent.slice(2).replace('中…', '')}：${e.message.replace(/^.*Error: /, '')}`; li.className = 'err'; }
    } finally {
      $('.go').disabled = false;
    }
  };

  const exportPdf = async (kind, opts) => {
    syncEp();
    await flush();
    const msg = kind === 'proposal' ? status : $('.sb-msg');
    try {
      const out = await window.hub.plans.pdf(plan, kind, opts);
      if (out) { msg.textContent = `PDFを書き出しました：${out}`; msg.classList.remove('err'); }
    } catch (e) { msg.textContent = `書き出せませんでした：${e.message.replace(/^.*Error: /, '')}`; msg.classList.add('err'); }
  };
  $('.pdf').onclick = () => exportPdf('proposal', { withStoryboard: $('.with-sb').checked });
  $('.sb-pdf').onclick = () => exportPdf($('.sb-kind').value, { all: $('.ep-all').checked });
  $('.blank-pdf').onclick = () => exportPdf('blank', { pages: Number($('.blank-pages').value) || 2 });

  // ---- 絵コンテ
  const setImage = async (cut, blob) => {
    delete cut.sketch; delete cut.cleaned;
    cut.image = await window.hub.plans.saveImage(plan.id, await readAsDataUrl(blob));
  };
  // 何枚か落としたら、そのカットから順にはめる（足りなければカットを足す）。
  // Procreate のテンプレートで描いた画像なら、印からページを読み取ってコマごとに切り分けてはめる
  const dropImages = async (index, files) => {
    const images = [...files].filter((f) => f.type.startsWith('image/'));
    const msg = $('.sb-msg');
    let k = 0;
    let filled = 0;
    let pages = 0;
    for (const f of images) {
      const sheet = await window.procreate.split(f).catch(() => null);
      if (sheet) {
        pages++;
        if (plan.aspect !== sheet.aspect) { plan.aspect = sheet.aspect; $('[data-f=aspect]').value = sheet.aspect; }
        for (const [i, dataUrl] of sheet.crops.entries()) {
          if (!dataUrl) continue;
          const at = sheet.page * sheet.perPage + i;
          while (plan.cuts.length <= at) plan.cuts.push({ id: crypto.randomUUID(), dur: 3, note: '' });
          delete plan.cuts[at].sketch; delete plan.cuts[at].cleaned;
          plan.cuts[at].image = await window.hub.plans.saveImage(plan.id, dataUrl);
          filled++;
        }
        continue;
      }
      if (!plan.cuts[index + k]) plan.cuts.push({ id: crypto.randomUUID(), dur: 3, note: '' });
      await setImage(plan.cuts[index + k], f);
      k++;
    }
    if (pages) { msg.classList.remove('err'); msg.textContent = `Procreate の ${pages}ページから ${filled}コマをはめました`; }
    if (images.length) { renderCuts(); changed(); }
  };

  $('.pc-template').onclick = async () => {
    const msg = $('.sb-msg');
    msg.classList.remove('err');
    try {
      const files = await window.procreate.templates({ ...plan, title: epTitle() }, { blankPages: Number($('.blank-pages').value) || 1 });
      const dir = await window.hub.plans.saveFiles(files, `Procreate_${(plan.title || '絵コンテ').replace(/[\\/:*?"<>|]/g, '')}`);
      if (dir) msg.textContent = `${files.length}ページのテンプレートを書き出しました：${dir}（AirDrop で iPad に送り、Procreate の「読み込む」で開いてください）`;
    } catch (e) { msg.textContent = `書き出せませんでした：${e.message.replace(/^.*Error: /, '')}`; msg.classList.add('err'); }
  };
  $('.pc-import').onclick = () => $('.pc-files').click();
  $('.pc-files').onchange = async () => { await dropImages(plan.cuts.length, $('.pc-files').files); $('.pc-files').value = ''; };

  // ---- 清書（ラフ → 自分の画風）。何コマか続けて押しても、順番に描き直す
  let cleanupReady = false;
  window.hub.plans.cleanupReady?.().then((ok) => { cleanupReady = ok; if (ok && plan) renderCuts(); }).catch(() => {});
  const cleaning = new Set();
  const cleanupCut = async (cut, frame) => {
    if (cleaning.has(cut.id)) return;
    const msg = $('.sb-msg');
    const owner = plan;
    cleaning.add(cut.id);
    renderCuts();
    msg.classList.remove('err');
    msg.textContent = `清書中…（${cleaning.size}コマ。1コマ1〜2分かかります）`;
    try {
      const sketch = cut.image === cut.cleaned && cut.sketch ? cut.sketch : cut.image;
      const out = await window.hub.plans.cleanup(owner.id, { image: sketch, note: cut.note, line: cut.line }, owner.aspect);
      cut.sketch = sketch;
      cut.cleaned = out;
      cut.image = out;
      msg.textContent = '清書しました。↺ でラフと見比べられます';
    } catch (e) {
      msg.textContent = `清書できませんでした：${e.message.replace(/^.*Error: /, '')}`;
      msg.classList.add('err');
    } finally {
      cleaning.delete(cut.id);
      if (plan === owner) { renderCuts(); changed(); } else { all = await window.hub.plans.save(owner); renderList(); }
    }
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
      // 行のどこをつかんでもドラッグで並べ替えられる（文字の入力欄とボタンの上は除く）
      const grip = el('span', 'grip', '⋮⋮');
      grip.title = 'ドラッグで並べ替え';
      li.onpointerdown = (e) => { li.draggable = !e.target.closest('input, textarea, select, button'); };
      li.ondragstart = (e) => {
        if (!li.draggable) return;
        dragFrom = i;
        e.dataTransfer.setData('text/x-cut', String(i));
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setDragImage(li, 40, 30);
        requestAnimationFrame(() => li.classList.add('dragging'));
      };
      li.ondragend = () => { li.draggable = false; dragFrom = null; ol.querySelectorAll('.cut').forEach((x) => x.classList.remove('dragging', 'drop-before', 'drop-after')); };
      // 行の上半分なら前、下半分なら後ろに入れる
      const after = (e) => { const r = li.getBoundingClientRect(); return e.clientY > r.top + r.height / 2; };
      li.ondragover = (e) => {
        if (dragFrom === null) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        ol.querySelectorAll('.cut').forEach((x) => { if (x !== li) x.classList.remove('drop-before', 'drop-after'); });
        li.classList.toggle('drop-after', after(e));
        li.classList.toggle('drop-before', !after(e));
      };
      li.ondragleave = (e) => { if (!li.contains(e.relatedTarget)) li.classList.remove('drop-before', 'drop-after'); };
      li.ondrop = (e) => {
        if (dragFrom === null) return;
        e.preventDefault();
        e.stopPropagation();
        let to = i + (after(e) ? 1 : 0);
        if (dragFrom < to) to--;
        const [moved] = plan.cuts.splice(dragFrom, 1);
        plan.cuts.splice(to, 0, moved);
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
      if (cut.image && cleanupReady) fbtn('✨', '清書：このラフを自分の画風で描き直す（このMacの中で生成）', () => cleanupCut(cut, frame));
      if (cut.sketch) fbtn('↺', cut.image === cut.sketch ? '清書した絵に戻す' : 'ラフに戻す', () => { [cut.image, cut.cleaned] = cut.image === cut.sketch ? [cut.cleaned, cut.sketch] : [cut.sketch, cut.image]; renderCuts(); changed(); });
      if (cut.image) fbtn('×', '絵を外す', () => { delete cut.image; delete cut.sketch; delete cut.cleaned; renderCuts(); changed(); });
      if (cleaning.has(cut.id)) frame.append(el('div', 'cleaning', '清書中…'));
      frame.append(ft, picker);

      const texts = el('div', 'texts');
      const note = el('textarea', 'note');
      note.value = cut.note ?? '';
      note.placeholder = 'ト書き（画面・カメラ・音）';
      note.oninput = () => { cut.note = note.value; changed(); };
      const line = el('textarea', 'line');
      line.value = cut.line ?? '';
      line.rows = 2;
      line.placeholder = 'セリフ・NA（例：イチローさん：ICTって何？）';
      line.oninput = () => { cut.line = line.value; changed(); };
      texts.append(note, line);

      const tools = el('div', 'cut-tools');
      const btn = (label, title, fn) => { const x = el('button', null, label); x.type = 'button'; x.title = title; x.onclick = fn; tools.append(x); };
      btn('↑', '上へ', () => { if (i) { plan.cuts.splice(i - 1, 0, plan.cuts.splice(i, 1)[0]); renderCuts(); changed(); } });
      btn('↓', '下へ', () => { if (i < plan.cuts.length - 1) { plan.cuts.splice(i + 1, 0, plan.cuts.splice(i, 1)[0]); renderCuts(); changed(); } });
      btn('⧉', '複製', () => { plan.cuts.splice(i + 1, 0, { ...structuredClone(cut), id: crypto.randomUUID() }); renderCuts(); changed(); });
      btn('×', 'カットを消す', () => { plan.cuts.splice(i, 1); renderCuts(); changed(); });

      li.append(grip, el('span', 'no', String(i + 1)), dur, frame, texts, tools);
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
    delete sketchCut.sketch; delete sketchCut.cleaned;
    sketchCut.image = await window.hub.plans.saveImage(plan.id, canvas.toDataURL('image/png'));
    dlg.close();
    renderCuts();
    changed();
  };

  // AI が作った篇とカットを入れる。すでにカットのある篇は上書きしない（手で直したものを守る）
  const mergeBoard = (eps = []) => {
    syncEp();
    const done = [];
    const kept = [];
    // まだ何も入っていない「本編」だけなら、AI の篇で置き換える
    if (plan.episodes.length === 1 && !plan.episodes[0].cuts.length && (eps.length > 1 || eps[0]?.name !== plan.episodes[0].name)) plan.episodes = [];
    for (const e of eps) {
      const same = plan.episodes.find((x) => x.name === e.name);
      if (same?.cuts.length) { kept.push(e.name); continue; }
      const seconds = e.seconds || e.cuts.reduce((n, c) => n + c.dur, 0);
      if (same) Object.assign(same, { cuts: e.cuts, seconds: same.seconds || seconds, aspect: e.aspect || same.aspect });
      else plan.episodes.push({ ...newEp(e.name, { aspect: e.aspect, seconds }), cuts: e.cuts });
      done.push(`${e.name} ${e.cuts.length}カット`);
    }
    if (!plan.episodes.length) plan.episodes = [newEp('本編', plan)];
    const first = plan.episodes.find((x) => done.some((d) => d.startsWith(`${x.name} `)));
    loadEp((first ?? curEp()).id);
    return [done.join('・'), kept.length ? `${kept.join('・')} は作成済みなのでそのまま` : ''].filter(Boolean).join('／') || '新しい篇はありません';
  };

  // ---- 企画書のファイルを企画メモに投げ込む → 読み込んだら一気に仕上げる
  const memo = $('[data-f=memo]');
  memo.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.stopPropagation(); memo.classList.add('over'); } });
  memo.addEventListener('dragleave', () => memo.classList.remove('over'));
  memo.addEventListener('drop', async (e) => {
    const f = e.dataTransfer.files[0];
    if (!f) return;
    e.preventDefault();
    e.stopPropagation();
    memo.classList.remove('over');
    const ol = $('.steps');
    ol.innerHTML = '';
    const li = el('li', 'now', `✱ 「${f.name}」を読み込み中…`);
    ol.append(li);
    try {
      const text = await window.hub.plans.readDoc(f);
      plan.memo = [plan.memo.trim(), text.trim()].filter(Boolean).join('\n\n');
      memo.value = plan.memo;
      if (!plan.title) { plan.title = f.name.replace(/\.[^.]+$/, ''); $('[data-f=title]').value = plan.title; }
      await persist();
      $('.go').click();
    } catch (err) {
      li.textContent = `× 読み込めませんでした：${err.message.replace(/^.*Error: /, '')}`;
      li.className = 'err';
    }
  });

  // ---- 篇の切り替え・追加・複製・削除
  const epTitle = () => (plan.episodes.length > 1 ? `${plan.title || '無題の企画'}　${curEp().name}` : plan.title);
  const renderEps = () => {
    const box = $('.ep-tabs');
    box.textContent = '';
    for (const ep of plan.episodes) {
      const b = el('button', ep.id === plan.ep ? 'on' : null);
      b.type = 'button';
      b.append(el('b', null, ep.name || '無題の篇'), el('small', null, `${(ep.id === plan.ep ? plan.cuts : ep.cuts).length}`));
      b.onclick = () => { if (ep.id === plan.ep) return; syncEp(); loadEp(ep.id); fill(); changed(); };
      box.append(b);
    }
    $('.ep-name').value = curEp().name;
    $('.ep-del').disabled = plan.episodes.length < 2;
    $('.ep-all-wrap').hidden = plan.episodes.length < 2;
  };
  const nextName = () => { const n = plan.episodes.length; return n < 26 ? `${String.fromCharCode(65 + n)}篇` : `${n + 1}篇`; };
  $('.ep-add').onclick = () => {
    syncEp();
    if (plan.episodes.length === 1 && curEp().name === '本編') curEp().name = 'A篇';
    const ep = newEp(nextName(), { aspect: plan.aspect, seconds: plan.seconds });
    plan.episodes.push(ep);
    loadEp(ep.id); fill(); changed();
    $('.ep-name').select();
  };
  $('.ep-dup').onclick = () => {
    syncEp();
    const src = curEp();
    const ep = { ...structuredClone(src), id: crypto.randomUUID(), name: `${src.name}のコピー` };
    ep.cuts.forEach((c) => { c.id = crypto.randomUUID(); });
    plan.episodes.splice(plan.episodes.indexOf(src) + 1, 0, ep);
    loadEp(ep.id); fill(); changed();
  };
  $('.ep-del').onclick = () => {
    const ep = curEp();
    if (plan.episodes.length < 2) return;
    if (!confirm(`「${ep.name}」を消しますか？この篇のカットもなくなります。`)) return;
    const i = plan.episodes.indexOf(ep);
    plan.episodes.splice(i, 1);
    loadEp(plan.episodes[Math.max(0, i - 1)].id); fill(); changed();
  };
  $('.ep-name').oninput = () => { curEp().name = $('.ep-name').value; renderEps(); $('.ep-name').focus(); changed(); };

  // ---- ライト／ダークの切り替え
  const themeBtn = $('.theme-btn');
  const showTheme = (mode = getTheme()) => { themeBtn.textContent = THEME_LABEL[mode]; themeBtn.title = THEME_TITLE[mode]; };
  themeBtn.onclick = () => showTheme(nextTheme());
  showTheme();

  // ---- タブ・新規・削除
  for (const b of pane.querySelectorAll('.tabs button')) {
    b.onclick = () => {
      pane.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
      pane.querySelectorAll('.pl-tab').forEach((t) => t.classList.toggle('on', t.classList.contains(b.dataset.tab)));
    };
  }
  // クリア：この企画を白紙に戻す（一覧には残す）。直後なら「元に戻す」で戻せる
  const hideUndo = () => { beforeClear = null; $('.undo-clear').hidden = true; };
  $('.clear').onclick = async () => {
    if (!confirm(`「${plan.title || '無題の企画'}」に書いた内容を全部消しますか？\n企画メモ・企画書・リファレンス・トンマナ・すべての篇とカット（はめた絵も）が白紙になります。\n消した直後なら「元に戻す」で戻せます。`)) return;
    syncEp();
    beforeClear = structuredClone(plan);
    withEps({ ...blank(), id: plan.id });
    $('.steps').textContent = '';
    $('.sb-msg').textContent = '';
    fill();
    await persist();
    status.textContent = 'クリアしました';
    $('.undo-clear').hidden = false;
  };
  $('.undo-clear').onclick = async () => {
    if (!beforeClear) return;
    withEps(beforeClear);
    hideUndo();
    fill();
    await persist();
    status.textContent = '元に戻しました';
  };

  $('.new').onclick = async () => { hideUndo(); await flush(); withEps(blank()); $('.steps').textContent = ''; fill(); };
  $('.del').onclick = async () => {
    hideUndo();
    clearTimeout(saveTimer); saveTimer = null;
    if (all.some((x) => x.id === plan.id)) {
      if (!confirm(`「${plan.title || '無題の企画'}」を削除しますか？はめた絵も消えます。`)) return;
      all = await window.hub.plans.remove(plan.id);
    }
    withEps(blank());
    fill();
  };

  (async () => {
    all = await window.hub.plans.list();
    withEps(all.length ? structuredClone([...all].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))[0]) : blank());
    fill();
  })();
  return pane;
}
