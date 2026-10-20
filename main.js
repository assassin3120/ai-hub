const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const { loadConnectors } = require('./connectors');
const { route } = require('./router');
const { runCli } = require('./runner');
const { orchestrate } = require('./orchestrator');
const obsidian = require('./obsidian');
const settings = require('./settings');
const invoices = require('./invoices');
const { calc } = require('./renderer/invoice-doc');

// Finder から起動すると PATH にシェルの設定が入らず claude / codex が見つからないので、ログインシェルから取り直す
if (process.platform === 'darwin') {
  try {
    const out = execFileSync(process.env.SHELL || '/bin/zsh', ['-ilc', 'printf "__PATH__%s" "$PATH"'], { encoding: 'utf8', timeout: 5000 });
    const p = out.split('__PATH__').pop();
    if (p) process.env.PATH = p;
  } catch { /* 取れなければ今の PATH のまま */ }
}

// Electron の名前が入った User-Agent だと Google などにログインを断られるので、普通の Chrome として名乗る
app.userAgentFallback = app.userAgentFallback.replace(/ (Electron|ai-hub)\/\S+/g, '');

const connectors = loadConnectors();
const cliMembers = connectors.filter((c) => c.kind === 'cli');
const leaderId = (cliMembers.find((c) => c.default) ?? cliMembers[0])?.id;
const names = Object.fromEntries(connectors.map((c) => [c.id, c.name]));

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 820, title: 'AI Hub',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), webviewTag: true },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

// CLIを1回実行する。画面へのストリームと Obsidian への記録もここで行う。
//   pane   : 指定すると、その画面に新しい作業として表示する（司令塔から回した作業など）
//   silent : 画面にも記録にも出さない（司令塔の計画づくり）
async function run(sender, id, prompt, { runId = crypto.randomUUID(), pane, label, display, via, from, silent } = {}) {
  const c = cliMembers.find((x) => x.id === id);
  const send = (ch, msg) => { if (!silent && !sender.isDestroyed()) sender.send(ch, msg); };
  if (!c) return { code: -1, output: '', error: `${id} は見つかりません` };
  if (pane) send('run:start', { runId, pane, label, display: display ?? prompt });
  const res = await runCli(c, prompt, {
    cwd: settings.get().workDir,
    onData: (type, data) => send('cli:event', { runId, type, data }),
  });
  send('cli:event', { runId, type: 'done', data: String(res.code) });
  if (!silent) {
    try {
      obsidian.logConversation(settings.get().vault, { name: c.name, via, from, prompt: display ?? prompt, output: res.output || res.error });
    } catch (e) { console.error('Obsidian への記録に失敗:', e); }
  }
  return res;
}

// レンダラには関数を含まない情報だけ渡す
ipcMain.handle('connectors:list', () =>
  connectors.map(({ id, name, icon, kind, url, panes, group, partition }) => ({ id, name, icon, kind, url, panes, group, partition })));

ipcMain.handle('router:route', (_e, prompt) => route(prompt, connectors));

ipcMain.on('cli:run', (event, { id, prompt, runId, via, display }) => run(event.sender, id, prompt, { runId, via, display }));

ipcMain.on('orch:start', async (event, { request, orchId, display = request }) => {
  const sender = event.sender;
  const emit = (ev) => { if (!sender.isDestroyed()) sender.send('orch:event', { orchId, ...ev }); };
  try {
    const result = await orchestrate({
      request,
      members: cliMembers,
      leaderId,
      emit,
      run: (id, prompt, opts) => run(sender, id, prompt, opts.silent ? { silent: true }
        : opts.summary ? { pane: 'orchestra', label: '📝 まとめ', display: `「${display}」の結果のまとめ`, via: '司令塔', from: '司令塔' }
          : { pane: id, label: `🎼 司令塔より「${opts.task.title}」`, display: opts.task.instruction, via: '司令塔', from: '司令塔' }),
    });
    const note = obsidian.logOrchestration(settings.get().vault, { ...result, request: display, names });
    if (note) emit({ type: 'note', path: note });
  } catch (e) {
    emit({ type: 'error', message: e.message });
  }
});

ipcMain.handle('invoice:list', () => invoices.list());
ipcMain.handle('invoice:save', (_e, inv) => invoices.save(inv));
ipcMain.handle('invoice:remove', (_e, id) => invoices.remove(id));
ipcMain.handle('invoice:nextNumber', (_e, date) => invoices.nextNumber(date));
ipcMain.handle('invoice:draft', async (event, memo) => {
  const clients = [...new Set(invoices.list().map((x) => x.client).filter(Boolean))];
  const res = await run(event.sender, leaderId, invoices.draftPrompt(memo, clients), { silent: true });
  const draft = invoices.parseDraft(res.output);
  if (!draft) throw new Error(res.error || '下書きを読み取れませんでした');
  return draft;
});
ipcMain.handle('invoice:pdf', async (_e, inv) => {
  const { invoiceDir, workDir, vault } = settings.get();
  const r = await dialog.showSaveDialog({
    defaultPath: path.join(invoiceDir || workDir || app.getPath('documents'), `請求書_${inv.number}_${inv.client || ''}.pdf`),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (r.canceled) return null;
  await invoices.toPdf(inv, settings.get().issuer ?? {}, r.filePath);
  settings.set({ invoiceDir: path.dirname(r.filePath) });
  try { obsidian.logInvoice(vault, inv, calc(inv), r.filePath); } catch (e) { console.error(e); }
  shell.showItemInFolder(r.filePath);
  return r.filePath;
});

ipcMain.handle('settings:get', () => settings.get());
ipcMain.handle('settings:set', (_e, patch) => settings.set(patch));
ipcMain.handle('settings:pickFolder', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('obsidian:import', () => {
  const { vault } = settings.get();
  if (!vault) throw new Error('先に Obsidian の保管庫を選んでください');
  return obsidian.importHistory(vault);
});
ipcMain.handle('obsidian:open', (_e, file) => {
  const target = file ?? path.join(settings.get().vault ?? '', obsidian.ROOT);
  return shell.openExternal(`obsidian://open?path=${encodeURIComponent(target)}`);
});

// ページ内の「新しいタブで開く」リンクは、同じ画面で開く
app.on('web-contents-created', (_e, wc) => {
  if (wc.getType() !== 'webview') return;
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) wc.loadURL(url);
    return { action: 'deny' };
  });
});

app.whenReady().then(() => {
  createWindow();
  // 起動のたびに、アプリの外で使った Claude Code・Codex の会話も取り込んでおく
  const { vault } = settings.get();
  if (vault) setImmediate(() => { try { obsidian.importHistory(vault); } catch (e) { console.error(e); } });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
