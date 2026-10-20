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
  </div>`;
  const fill = (s) => { for (const i of pane.querySelectorAll('input[data-key]')) i.value = s[i.dataset.key] ?? ''; };
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
  wv.setAttribute('allowpopups', ''); // 新しいタブのリンクは main.js で同じ画面に開き直す
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

function webPane(c) {
  const pane = el('section', 'pane');
  const wv = document.createElement('webview');
  wv.src = c.url;
  wv.setAttribute('partition', `persist:${c.id}`); // アプリごとにログイン状態を保持
  pane.append(wv);
  return pane;
}

function show(id) {
  for (const [k, p] of Object.entries(panes)) p.classList.toggle('active', k === id);
  for (const b of sidebar.querySelectorAll('button')) b.classList.toggle('active', b.dataset.id === id);
}

window.hub.listConnectors().then((connectors) => {
  names = Object.fromEntries(connectors.map((c) => [c.id, c.name]));
  const cliList = connectors.filter((c) => c.kind === 'cli');
  const hubs = cliList.length > 1 ? [
    { id: 'orchestra', name: '司令塔', icon: '🎼', kind: 'hub', make: orchestraPane },
    { id: 'auto', name: 'おまかせ', icon: '✨', kind: 'hub', make: () => autoPane(cliList) },
  ] : [];
  const list = [...hubs, ...connectors, { id: 'settings', name: '設定', icon: '⚙️', kind: 'settings', make: settingsPane }];
  let lastKind = null;
  for (const c of list) {
    if (lastKind && lastKind !== c.kind) sidebar.append(document.createElement('hr'));
    lastKind = c.kind;
    const b = el('button');
    b.dataset.id = c.id;
    b.title = c.name;
    b.innerHTML = `${c.icon}<small></small>`;
    b.querySelector('small').textContent = c.name;
    b.onclick = () => show(c.id);
    sidebar.append(b);
    panes[c.id] = c.make ? c.make()
      : c.kind === 'cli' ? chatPane(c)
        : c.kind === 'browser' ? browserPane(c, [...hubs, ...cliList])
          : webPane(c);
    stage.append(panes[c.id]);
  }
  if (list.length) show(list[0].id);
});
