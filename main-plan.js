// 企画・絵コンテを単独のアプリとして開く（ハブなしで使う）
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { runCli } = require('./runner');
const settings = require('./settings');
const { registerPlanIpc } = require('./plan-ipc');
const { fixPath } = require('./shell-path');
const claude = require('./connectors/claude');

fixPath();

function createWindow() {
  const win = new BrowserWindow({
    width: 1360, height: 860, minWidth: 900, minHeight: 600, title: '企画・絵コンテ',
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'plan.html'));
}

registerPlanIpc({ ask: (_sender, prompt, { web }) => runCli(claude, prompt, { cwd: settings.get().workDir, web }) });
ipcMain.handle('settings:get', () => settings.get());
ipcMain.handle('settings:set', (_e, patch) => settings.set(patch));

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
