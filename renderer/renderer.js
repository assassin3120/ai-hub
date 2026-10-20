const sidebar = document.getElementById('sidebar');
const stage = document.getElementById('stage');
const panes = {};
const runs = {};

window.hub.onCliEvent(({ runId, type, data }) => {
  const el = runs[runId];
  if (!el) return;
  if (type === 'out') el.textContent += data;
  if (type === 'err') { el.classList.add('err'); el.textContent += data; }
  if (type === 'done') delete runs[runId];
  el.parentElement.scrollTop = el.parentElement.scrollHeight;
});

function chatPane(c) {
  const pane = document.createElement('section');
  pane.className = 'pane chat';
  pane.innerHTML = `<div class="log"></div>
    <form><textarea placeholder="${c.name} に話しかける（⌘+Enterで送信）"></textarea><button>送信</button></form>`;
  const log = pane.querySelector('.log');
  const input = pane.querySelector('textarea');
  const form = pane.querySelector('form');
  const submit = (e) => {
    e?.preventDefault();
    const prompt = input.value.trim();
    if (!prompt) return;
    input.value = '';
    const u = document.createElement('div'); u.className = 'msg user'; u.textContent = prompt; log.append(u);
    const a = document.createElement('div'); a.className = 'msg'; log.append(a);
    const runId = crypto.randomUUID();
    runs[runId] = a;
    window.hub.runCli(c.id, prompt, runId);
  };
  form.addEventListener('submit', submit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e); });
  return pane;
}

function webPane(c) {
  const pane = document.createElement('section');
  pane.className = 'pane';
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

window.hub.listConnectors().then((list) => {
  let lastKind = null;
  for (const c of list) {
    if (lastKind && lastKind !== c.kind) sidebar.append(document.createElement('hr'));
    lastKind = c.kind;
    const b = document.createElement('button');
    b.dataset.id = c.id;
    b.title = c.name;
    b.innerHTML = `${c.icon}<small>${c.name}</small>`;
    b.onclick = () => show(c.id);
    sidebar.append(b);
    panes[c.id] = c.kind === 'cli' ? chatPane(c) : webPane(c);
    stage.append(panes[c.id]);
  }
  if (list.length) show(list[0].id);
});
