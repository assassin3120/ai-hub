const sidebar = document.getElementById('sidebar');
const stage = document.getElementById('stage');
const panes = {};
const runs = {};
const orchestras = {};
let names = {};

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const scrollDown = (log) => { log.scrollTop = log.scrollHeight; };

window.hub.onCliEvent(({ runId, type, data }) => {
  const out = runs[runId];
  if (!out) return;
  if (type === 'out') out.textContent += data;
  if (type === 'err') { out.classList.add('err'); out.textContent += data; }
  if (type === 'done') delete runs[runId];
  scrollDown(out.parentElement);
});

// 司令塔から回ってきた作業を、担当の画面に表示する
window.hub.onRunStart(({ runId, pane, label, display }) => {
  const log = panes[pane]?.querySelector('.log');
  if (!log) return;
  const req = el('div', 'msg assigned');
  req.append(el('b', null, label), el('div', null, display));
  log.append(req);
  runs[runId] = log.appendChild(el('div', 'msg'));
  scrollDown(log);
  sidebar.querySelector(`[data-id="${pane}"]`)?.classList.add('busy');
});

function chatShell(placeholder, onSend) {
  const pane = el('section', 'pane chat');
  pane.innerHTML = `<div class="log"></div>
    <form><textarea></textarea><button>送信</button></form>`;
  const log = pane.querySelector('.log');
  const input = pane.querySelector('textarea');
  input.placeholder = `${placeholder}（⌘+Enterで送信）`;
  // display は画面と記録に出す短い文。ブラウザから送るときはページ本文を隠して質問だけ見せる
  const send = (text, display = text) => {
    log.append(el('div', 'msg user', display));
    onSend(text, log, display);
    scrollDown(log);
  };
  const submit = (e) => {
    e?.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    send(text);
  };
  pane.send = send;
  pane.querySelector('form').addEventListener('submit', submit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e); });
  return pane;
}

function startRun(log, id, prompt, via, display) {
  const runId = crypto.randomUUID();
  runs[runId] = log.appendChild(el('div', 'msg'));
  window.hub.runCli(id, prompt, runId, via, display);
}

function chatPane(c) {
  return chatShell(`${c.name} に話しかける`, (prompt, log, display) => startRun(log, c.id, prompt, undefined, display));
}

// おまかせ：送るたびに得意なAIを選ぶ
function autoPane(cliList) {
  const showRoute = (log, r, prompt, display) => {
    const badge = el('div', 'msg route');
    badge.innerHTML = '→ <b></b> に依頼しました <span></span>';
    badge.querySelector('b').textContent = r.name;
    badge.querySelector('span').textContent = r.reason;
    for (const other of cliList.filter((x) => x.id !== r.id)) {
      const b = el('button', null, `${other.name}でやり直す`);
      b.type = 'button';
      b.onclick = () => { b.disabled = true; showRoute(log, { ...other, reason: '手動で切り替え' }, prompt, display); };
      badge.append(b);
    }
    log.append(badge);
    startRun(log, r.id, prompt, 'おまかせ', display);
  };
  return chatShell('依頼を書くと、得意なAIに自動で振り分けます', async (prompt, log, display) => {
    // ページ本文の言葉に引っ張られないよう、振り分けは質問文だけで決める
    showRoute(log, await window.hub.route(display), prompt, display);
  });
}

// 司令塔：1つの依頼を分けて、各担当の画面で同時に動かす
const STATUS = { waiting: '待機中', running: '作業中', done: '完了', failed: '失敗' };

window.hub.onOrchEvent((ev) => {
  const o = orchestras[ev.orchId];
  if (!o) return;
  if (ev.type === 'planning') o.board.append(el('div', 'note', '作業を分けています…'));
  if (ev.type === 'plan') {
    o.board.textContent = '';
    o.cards = ev.tasks.map((t, i) => {
      const card = el('button', 'task waiting');
      card.type = 'button';
      card.innerHTML = '<span class="who"></span><span class="title"></span><span class="state"></span>';
      card.querySelector('.who').textContent = names[t.assignee] ?? t.assignee;
      card.querySelector('.title').textContent = `${i + 1}. ${t.title}`;
      card.querySelector('.state').textContent = t.dependsOn.length ? `待機中（${t.dependsOn.map((d) => d + 1).join('・')}の後）` : STATUS.waiting;
      card.onclick = () => show(t.assignee);
      o.board.append(card);
      return card;
    });
  }
  if (ev.type === 'status') {
    const card = o.cards[ev.index];
    card.className = `task ${ev.status}`;
    card.querySelector('.state').textContent = STATUS[ev.status];
  }
  if (ev.type === 'summarizing') o.board.append(el('div', 'note', '結果をまとめています…'));
  if (ev.type === 'note') {
    const b = el('button', 'link', 'Obsidian で記録を開く');
    b.type = 'button';
    b.onclick = () => window.hub.openInObsidian(ev.path);
    o.log.append(b);
  }
  if (ev.type === 'error') o.log.append(el('div', 'msg err', ev.message));
  if (ev.type === 'done' || ev.type === 'error') {
    for (const b of sidebar.querySelectorAll('.busy')) b.classList.remove('busy');
  }
  scrollDown(o.log);
});

function orchestraPane() {
  return chatShell('司令塔に依頼すると、作業を分けて各担当に回します', (request, log, display) => {
    const orchId = crypto.randomUUID();
    const board = log.appendChild(el('div', 'board'));
    orchestras[orchId] = { log, board, cards: [] };
    window.hub.startOrchestra(request, orchId, display);
  });
}

// 設定：作業フォルダと Obsidian の保管庫
function settingsPane() {
  const pane = el('section', 'pane settings');
  pane.innerHTML = `<div class="form">
    <h2>設定</h2>
    <label>作業フォルダ<small>Claude と Codex がファイルを読み書きする場所</small></label>
    <div class="row"><input data-key="workDir" readonly placeholder="未設定"><button data-pick="workDir">選ぶ</button></div>
    <label>Obsidian の保管庫<small>すべての会話を「AI Hub」フォルダに記録します</small></label>
    <div class="row"><input data-key="vault" readonly placeholder="未設定"><button data-pick="vault">選ぶ</button></div>
    <div class="row">
      <button id="import">これまでの Claude Code・Codex の会話を取り込む</button>
      <button id="open-obsidian">Obsidian で開く</button>
    </div>
    <p id="import-result"></p>
    <h2>請求書の発行者</h2>
    <div class="issuer">
      <label>名前・屋号<input data-issuer="name"></label>
      <label>適格請求書の登録番号<input data-issuer="regNo" placeholder="T1234567890123"></label>
      <label>住所<textarea data-issuer="address" rows="2"></textarea></label>
      <label>連絡先<textarea data-issuer="contact" rows="2" placeholder="電話・メール"></textarea></label>
      <label>振込先<textarea data-issuer="bank" rows="3" placeholder="〇〇銀行 〇〇支店 普通 1234567 名義"></textarea></label>
    </div>
  </div>`;
  const fill = (s) => {
    for (const i of pane.querySelectorAll('input[data-key]')) i.value = s[i.dataset.key] ?? '';
    for (const i of pane.querySelectorAll('[data-issuer]')) i.value = s.issuer?.[i.dataset.issuer] ?? '';
  };
  for (const i of pane.querySelectorAll('[data-issuer]')) {
    i.addEventListener('change', async () => {
      const issuer = Object.fromEntries([...pane.querySelectorAll('[data-issuer]')].map((x) => [x.dataset.issuer, x.value]));
      await window.hub.setSettings({ issuer });
      panes.invoice?.refresh?.();
    });
  }
  window.hub.getSettings().then(fill);
  for (const b of pane.querySelectorAll('[data-pick]')) {
    b.onclick = async () => {
      const dir = await window.hub.pickFolder();
      if (dir) fill(await window.hub.setSettings({ [b.dataset.pick]: dir }));
    };
  }
  const result = pane.querySelector('#import-result');
  pane.querySelector('#import').onclick = async () => {
    result.textContent = '取り込み中…';
    try {
      const counts = await window.hub.importHistory();
      const parts = Object.entries(counts).map(([k, v]) => `${k} ${v}件`);
      result.textContent = parts.length ? `取り込みました：${parts.join('、')}` : '取り込める会話が見つかりませんでした';
    } catch (e) {
      result.textContent = e.message.replace(/^.*Error: /, '');
    }
  };
  pane.querySelector('#open-obsidian').onclick = () => window.hub.openInObsidian();
  return pane;
}

// ブラウザ：ふつうに見て回り、見ているページや動画の字幕をそのままAIに渡す
const MAX_PAGE_CHARS = 60000;
const KIND_LABEL = { selection: '選択した部分', video: '動画', page: 'ページ', 'page-with-video': 'ページ' };

function browserPane(c, targets) {
  const pane = el('section', 'pane browser');
  pane.innerHTML = `<div class="toolbar">
      <button type="button" data-nav="back" title="戻る">←</button>
      <button type="button" data-nav="forward" title="進む">→</button>
      <button type="button" data-nav="reload" title="再読み込み">↻</button>
      <input class="address" spellcheck="false">
    </div>
    <div class="body">
      <webview></webview>
      <aside class="ask">
        <b>このページをAIに聞く</b>
        <small>選択した部分があればそこだけ、YouTube なら字幕を読み取ります</small>
        <select></select>
        <textarea>このページの内容を日本語で要約して</textarea>
        <button type="button" class="primary">読み取って送る</button>
        <p class="result"></p>
      </aside>
    </div>`;
  const wv = pane.querySelector('webview');
  const address = pane.querySelector('.address');
  wv.setAttribute('partition', `persist:${c.id}`);
  wv.setAttribute('allowpopups', '');
  wv.src = c.url;

  const go = (text) => {
    const t = text.trim();
    if (!t) return;
    const url = /^https?:\/\//.test(t) ? t
      : /^[^\s]+\.[a-z]{2,}(\/|$)/i.test(t) ? `https://${t}`
        : `https://www.google.com/search?q=${encodeURIComponent(t)}`;
    wv.loadURL(url).catch(() => { /* 読み込み失敗はページ側にエラー表示が出る */ });
  };
  address.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(address.value); });
  for (const ev of ['did-navigate', 'did-navigate-in-page']) wv.addEventListener(ev, () => { address.value = wv.getURL(); });
  for (const b of pane.querySelectorAll('[data-nav]')) {
    b.onclick = () => ({ back: () => wv.canGoBack() && wv.goBack(), forward: () => wv.canGoForward() && wv.goForward(), reload: () => wv.reload() })[b.dataset.nav]();
  }

  const select = pane.querySelector('select');
  for (const t of targets) select.append(Object.assign(el('option', null, `${t.icon} ${t.name}に送る`), { value: t.id }));
  const question = pane.querySelector('textarea');
  const result = pane.querySelector('.result');
  pane.querySelector('.primary').onclick = async () => {
    result.textContent = '読み取っています…';
    let page;
    try {
      page = await wv.executeJavaScript(`(${extractPage.toString()})()`);
    } catch (e) {
      result.textContent = `読み取れませんでした: ${e.message}`;
      return;
    }
    if (!page.text || page.url.startsWith('chrome-error:')) {
      result.textContent = '読み取れる内容がありませんでした。ページが開けているか確かめてください。';
      return;
    }
    const cut = page.text.length > MAX_PAGE_CHARS;
    const body = cut ? `${page.text.slice(0, MAX_PAGE_CHARS)}\n…（長いので途中まで）` : page.text;
    const q = question.value.trim() || 'この内容を要約して';
    const prompt = `${q}\n\n---\n種類: ${KIND_LABEL[page.kind]}\nタイトル: ${page.title}\nURL: ${page.url}\n\n${body}`;
    const display = `🌐 ${KIND_LABEL[page.kind]}「${page.title}」を読み取って：${q}\n${page.url}`;
    panes[select.value].send(prompt, display);
    show(select.value);
    result.textContent = `${page.text.length.toLocaleString()}文字を送りました${page.kind === 'video' && !page.hasTranscript ? '（この動画は字幕が見つからず、概要欄だけです）' : ''}`;
  };
  return pane;
}

function makeWebview(c) {
  const wv = document.createElement('webview');
  wv.setAttribute('partition', `persist:${c.partition ?? c.id}`); // アプリごとにログイン状態を保持（同じアプリなら画面が違っても共通）
  wv.setAttribute('allowpopups', ''); // 新しいタブのリンクは main.js で同じ画面に開き直す
  wv.src = c.url;
  return wv;
}

// 請求書：作る・保存する・PDFにする。AI に案件メモから下書きさせることもできる
const today = () => new Date().toLocaleDateString('sv-SE');
const endOfNextMonth = (d) => { const t = new Date(d); return new Date(t.getFullYear(), t.getMonth() + 2, 0).toLocaleDateString('sv-SE'); };

function invoicePane() {
  const pane = el('section', 'pane invoice');
  pane.innerHTML = `<aside class="inv-list"><button type="button" class="primary new">＋ 新しい請求書</button><ul></ul></aside>
    <div class="inv-edit">
      <details class="draft"><summary>✨ メモからAIに下書きさせる</summary>
        <textarea placeholder="例：ABC株式会社にヨルシカMVの撮影費30万円と編集費15万円、源泉あり"></textarea>
        <button type="button" class="go">下書きを作る</button><span class="msg"></span></details>
      <div class="grid">
        <label>請求番号<input data-f="number"></label>
        <label>請求日<input type="date" data-f="date"></label>
        <label class="wide">宛先<span class="row"><input data-f="client" list="inv-clients" placeholder="取引先名"><select data-f="honorific"><option>御中</option><option>様</option></select></span></label>
        <label class="wide">件名<input data-f="subject"></label>
        <label>お支払期限<input type="date" data-f="dueDate"></label>
        <label class="check"><input type="checkbox" data-f="withholding">源泉徴収する</label>
      </div>
      <datalist id="inv-clients"></datalist>
      <table class="items"><thead><tr><th>品目</th><th>数量</th><th>単位</th><th>単価（税抜）</th><th>税率</th><th></th></tr></thead><tbody></tbody></table>
      <button type="button" class="add">＋ 行を追加</button>
      <label class="wide">備考<textarea data-f="note" rows="2"></textarea></label>
      <div class="actions"><button type="button" class="primary save">保存</button><button type="button" class="pdf">PDFに書き出す</button><button type="button" class="dup">複製して新規</button><button type="button" class="del">削除</button><span class="msg status"></span></div>
    </div>
    <div class="inv-preview"><div class="paper"></div></div>`;
  const $ = (q) => pane.querySelector(q);
  const status = $('.status');
  let all = [];
  let inv;
  let issuer = {};

  const blank = async () => {
    const date = today();
    return { id: crypto.randomUUID(), number: await window.hub.invoices.nextNumber(date), date, dueDate: endOfNextMonth(date), client: '', honorific: '御中', subject: '', items: [{ name: '', qty: 1, unit: '式', price: 0, rate: 10 }], withholding: false, note: '' };
  };

  const preview = () => {
    $('.paper').innerHTML = window.invoiceDoc.invoiceHtml(inv, issuer);
    const c = window.invoiceDoc.calc(inv);
    status.textContent = `ご請求額 ¥${c.due.toLocaleString('ja-JP')}`;
  };

  const renderItems = () => {
    const tb = $('.items tbody');
    tb.textContent = '';
    inv.items.forEach((it, i) => {
      const tr = el('tr');
      tr.innerHTML = `<td><input data-k="name"></td><td><input data-k="qty" type="number" step="any" class="num"></td><td><input data-k="unit" class="unit"></td>
        <td><input data-k="price" type="number" step="1" class="num"></td><td><select data-k="rate"><option value="10">10%</option><option value="8">8%</option></select></td><td><button type="button" class="x" title="行を消す">×</button></td>`;
      for (const input of tr.querySelectorAll('[data-k]')) {
        input.value = it[input.dataset.k] ?? '';
        input.addEventListener('input', () => {
          const k = input.dataset.k;
          it[k] = ['qty', 'price', 'rate'].includes(k) ? Number(input.value) : input.value;
          preview();
        });
      }
      tr.querySelector('.x').onclick = () => { inv.items.splice(i, 1); renderItems(); preview(); };
      tb.append(tr);
    });
  };

  const fill = () => {
    for (const input of pane.querySelectorAll('.inv-edit [data-f]')) {
      if (input.type === 'checkbox') input.checked = Boolean(inv[input.dataset.f]);
      else input.value = inv[input.dataset.f] ?? '';
    }
    renderItems();
    preview();
    for (const li of pane.querySelectorAll('.inv-list li')) li.classList.toggle('active', li.dataset.id === inv.id);
  };

  const renderList = () => {
    const ul = $('.inv-list ul');
    ul.textContent = '';
    for (const x of [...all].sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.number.localeCompare(a.number))) {
      const li = el('li');
      li.dataset.id = x.id;
      li.append(el('b', null, x.client || '（宛先なし）'), el('span', null, `${x.number}・${x.date}`), el('span', 'amt', `¥${window.invoiceDoc.calc(x).due.toLocaleString('ja-JP')}`));
      li.onclick = () => { inv = structuredClone(x); fill(); };
      ul.append(li);
    }
    $('#inv-clients').replaceChildren(...[...new Set(all.map((x) => x.client).filter(Boolean))].map((v) => Object.assign(el('option'), { value: v })));
  };

  for (const input of pane.querySelectorAll('.inv-edit [data-f]')) {
    input.addEventListener('input', () => { inv[input.dataset.f] = input.type === 'checkbox' ? input.checked : input.value; preview(); });
  }
  $('.add').onclick = () => { inv.items.push({ name: '', qty: 1, unit: '', price: 0, rate: 10 }); renderItems(); preview(); };
  $('.new').onclick = async () => { inv = await blank(); fill(); };
  $('.save').onclick = async () => { all = await window.hub.invoices.save(inv); renderList(); fill(); status.textContent = '保存しました'; };
  $('.dup').onclick = async () => {
    const date = today();
    inv = { ...structuredClone(inv), id: crypto.randomUUID(), date, dueDate: endOfNextMonth(date), number: await window.hub.invoices.nextNumber(date) };
    fill();
  };
  $('.del').onclick = async () => {
    if (!all.some((x) => x.id === inv.id)) { inv = await blank(); fill(); return; }
    if (!confirm(`${inv.number} を削除しますか？`)) return;
    all = await window.hub.invoices.remove(inv.id); renderList(); inv = await blank(); fill();
  };
  $('.pdf').onclick = async () => {
    all = await window.hub.invoices.save(inv); renderList();
    try {
      const out = await window.hub.invoices.pdf(inv);
      if (out) status.textContent = `PDFを書き出しました：${out}`;
    } catch (e) { status.textContent = `書き出せませんでした：${e.message}`; }
  };
  $('.draft .go').onclick = async () => {
    const memo = $('.draft textarea').value.trim();
    const msg = $('.draft .msg');
    if (!memo) return;
    msg.textContent = 'Claudeが下書き中…';
    try {
      const d = await window.hub.invoices.draft(memo);
      inv = { ...inv, ...d, items: d.items.length ? d.items : inv.items };
      fill();
      msg.textContent = '下書きを入れました。金額を確かめてから保存してください。';
    } catch (e) { msg.textContent = `うまくいきませんでした：${e.message.replace(/^.*Error: /, '')}`; }
  };

  pane.refresh = async () => { issuer = (await window.hub.getSettings()).issuer ?? {}; if (inv) preview(); };
  (async () => {
    all = await window.hub.invoices.list();
    await pane.refresh();
    inv = await blank();
    renderList();
    fill();
  })();
  return pane;
}

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

function webPane(c) {
  const pane = el('section', 'pane');
  pane.append(makeWebview(c));
  return pane;
}

// 複数のアプリを横に並べて同時に見る（SNS など）
function splitPane(c, byId) {
  const pane = el('section', 'pane split');
  for (const id of c.panes) {
    const app = byId[id];
    if (!app) continue;
    const col = el('div', 'col');
    const head = el('div', 'col-head');
    const reload = el('button', null, '↻');
    reload.type = 'button';
    reload.title = '再読み込み';
    head.append(el('span', null, `${app.icon} ${app.name}`), reload);
    const wv = makeWebview(app);
    reload.onclick = () => wv.reload();
    col.append(head, wv);
    pane.append(col);
  }
  return pane;
}

function show(id) {
  for (const [k, p] of Object.entries(panes)) p.classList.toggle('active', k === id);
  for (const b of sidebar.querySelectorAll('button')) b.classList.toggle('active', b.dataset.id === id);
}

document.head.append(Object.assign(document.createElement('style'), { textContent: window.invoiceDoc.INVOICE_CSS + window.planDoc.PLAN_CSS }));

sidebar.append(el('div', 'brand', 'AI Hub'));

window.hub.listConnectors().then((connectors) => {
  names = Object.fromEntries(connectors.map((c) => [c.id, c.name]));
  const cliList = connectors.filter((c) => c.kind === 'cli');
  const byId = Object.fromEntries(connectors.map((c) => [c.id, c]));
  const hubs = cliList.length > 1 ? [
    { id: 'orchestra', name: '司令塔', icon: '🎼', kind: 'hub', make: orchestraPane },
    { id: 'auto', name: 'おまかせ', icon: '✨', kind: 'hub', make: () => autoPane(cliList) },
  ] : [];
  const tools = [
    { id: 'plan', name: '企画・絵コンテ', icon: '🎬', kind: 'tool', make: planPane },
    { id: 'invoice', name: '請求書', icon: '🧾', kind: 'tool', make: invoicePane },
  ];
  const list = [...hubs, ...connectors, ...tools, { id: 'settings', name: '設定', icon: '⚙️', kind: 'settings', make: settingsPane }];
  let lastKind = null;
  for (const c of list) {
    const group = c.group ?? (c.kind === 'split' ? 'web' : c.kind);
    if (lastKind && lastKind !== group) sidebar.append(document.createElement('hr'));
    lastKind = group;
    const b = el('button');
    b.dataset.id = c.id;
    b.title = c.name;
    b.innerHTML = '<span class="ic"></span><small></small>';
    b.querySelector('.ic').textContent = c.icon;
    b.querySelector('small').textContent = c.name;
    b.onclick = () => show(c.id);
    sidebar.append(b);
    panes[c.id] = c.make ? c.make()
      : c.kind === 'cli' ? chatPane(c)
        : c.kind === 'browser' ? browserPane(c, [...hubs, ...cliList])
          : c.kind === 'split' ? splitPane(c, byId)
            : webPane(c);
    // 会話の画面には、X のように上に名前の帯を付ける
    if (panes[c.id].classList.contains('chat')) panes[c.id].prepend(el('header', 'pane-head', c.name));
    stage.append(panes[c.id]);
  }
  if (list.length) show(list[0].id);
});
