const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const { loadConnectors } = require('./connectors');
const { route } = require('./router');

const connectors = loadConnectors();

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 820, title: 'AI Hub',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), webviewTag: true },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

// レンダラには関数を含まない情報だけ渡す
ipcMain.handle('connectors:list', () =>
  connectors.map(({ id, name, icon, kind, url }) => ({ id, name, icon, kind, url })));

ipcMain.handle('router:route', (_e, prompt) => route(prompt, connectors));

// CLIコネクタの実行。出力はストリームでレンダラへ流す。
ipcMain.on('cli:run', (event, { id, prompt, runId }) => {
  const c = connectors.find((x) => x.id === id && x.kind === 'cli');
  if (!c) return;
  const child = spawn(c.command, c.args(prompt), { shell: process.platform === 'win32' });
  const send = (type, data) => event.sender.send('cli:event', { runId, type, data: String(data) });
  child.stdout.on('data', (d) => send('out', d));
  child.stderr.on('data', (d) => send('err', d));
  child.on('error', (e) => send('err', `${c.command} を起動できません: ${e.message}\n`));
  child.on('close', (code) => send('done', code));
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
