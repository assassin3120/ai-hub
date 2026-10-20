// HTML を PDF にする。画像（file://）も読めるよう、いったんファイルに書き出して開く。
const { app, BrowserWindow } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

async function htmlToPdf(html, outPath, { landscape = false, preferCSSPageSize = false } = {}) {
  const tmp = path.join(app.getPath('temp'), `ai-hub-${crypto.randomUUID()}.html`);
  fs.writeFileSync(tmp, html);
  const win = new BrowserWindow({ show: false, webPreferences: { javascript: false } });
  try {
    await win.loadFile(tmp);
    const pdf = await win.webContents.printToPDF({ pageSize: 'A4', landscape, preferCSSPageSize, printBackground: true, margins: { marginType: 'none' } });
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, pdf);
    return outPath;
  } finally {
    win.destroy();
    fs.rmSync(tmp, { force: true });
  }
}

module.exports = { htmlToPdf };
