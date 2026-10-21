const sidebar = document.getElementById('sidebar');
const stage = document.getElementById('stage');
const panes = {};
const runs = {};
const orchestras = {};
let names = {};

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
