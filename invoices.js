// 請求書の保存（ユーザーデータに JSON）、番号の採番、PDF 書き出し
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { invoiceHtml, INVOICE_CSS } = require('./renderer/invoice-doc');

const file = () => path.join(app.getPath('userData'), 'invoices.json');

function list() {
  try { return JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { return []; }
}

function save(inv) {
  const all = list().filter((x) => x.id !== inv.id);
  all.push({ ...inv, updatedAt: new Date().toISOString() });
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(all, null, 2));
  return all;
}

function remove(id) {
  const all = list().filter((x) => x.id !== id);
  fs.writeFileSync(file(), JSON.stringify(all, null, 2));
  return all;
}

// 請求日の年月ごとの連番：INV-202610-001
function nextNumber(date) {
  const ym = (date || new Date().toISOString()).slice(0, 7).replace('-', '');
  const used = list().map((x) => x.number).filter((n) => n?.startsWith(`INV-${ym}-`)).map((n) => Number(n.split('-')[2]) || 0);
  return `INV-${ym}-${String(Math.max(0, ...used) + 1).padStart(3, '0')}`;
}

async function toPdf(inv, issuer, outPath) {
  const html = `<!doctype html><meta charset="utf-8"><style>@page{size:A4;margin:0}body{margin:0}${INVOICE_CSS}</style>${invoiceHtml(inv, issuer)}`;
  const win = new BrowserWindow({ show: false, webPreferences: { javascript: false } });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const pdf = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true });
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, pdf);
    return outPath;
  } finally {
    win.destroy();
  }
}

// 司令塔と同じく、Claude に案件メモから請求書の下書きを JSON で作らせる
const draftPrompt = (memo, clients) => `次のメモから請求書の下書きを作ってください。出力はJSONだけ。説明文やコードブロックは付けない。
わからない項目は空にする。金額は税抜の円の数値。税率は通常10、食品などの軽減税率は8。
個人への報酬（撮影・デザイン・原稿料など）で、相手が会社なら withholding は true の可能性が高いが、メモに書いていなければ false。
${clients.length ? `過去の取引先: ${clients.join('、')}\n` : ''}
形式: {"client":"取引先名","honorific":"御中 か 様","subject":"件名","items":[{"name":"品目","qty":1,"unit":"式","price":0,"rate":10}],"withholding":false,"note":"備考"}

メモ:
${memo}`;

function parseDraft(text) {
  try {
    const j = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    return {
      client: String(j.client ?? ''),
      honorific: j.honorific === '様' ? '様' : '御中',
      subject: String(j.subject ?? ''),
      items: (Array.isArray(j.items) ? j.items : []).map((it) => ({
        name: String(it.name ?? ''), qty: Number(it.qty) || 1, unit: String(it.unit ?? ''),
        price: Number(it.price) || 0, rate: Number(it.rate) === 8 ? 8 : 10,
      })),
      withholding: Boolean(j.withholding),
      note: String(j.note ?? ''),
    };
  } catch {
    return null;
  }
}

module.exports = { list, save, remove, nextNumber, toPdf, draftPrompt, parseDraft };
