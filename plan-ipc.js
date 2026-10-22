// 企画書・絵コンテの IPC。ハブ（main.js）と単独アプリ（main-plan.js）の両方で使う
//   ask(sender, prompt, { web, images }) : AI に1回頼んで { output, error } を返す
const { app, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const plans = require('./plans');
const planDoc = require('./renderer/plan-doc');
const settings = require('./settings');
const obsidian = require('./obsidian');
const { htmlToPdf } = require('./pdf');

function planPdf(plan, kind, opts, outPath) {
  const imageUrl = (p) => pathToFileURL(p).href;
  const body = kind === 'proposal' ? planDoc.proposalHtml(plan, { ...opts, imageUrl })
    : planDoc.storyboardHtml(plan, { blank: kind === 'blank', pages: opts.pages, imageUrl });
  // 企画書は横、絵コンテは縦。同じ PDF の中でページごとに向きを変える
  const css = `@page land{size:A4 landscape;margin:0}@page port{size:A4 portrait;margin:0}.pp-page{page:land}.sb-page{page:port}body{margin:0}${planDoc.PLAN_CSS}`;
  return htmlToPdf(`<!doctype html><meta charset="utf-8"><style>${css}</style>${body}`, outPath, { preferCSSPageSize: true });
}

function registerPlanIpc({ ask }) {
  ipcMain.handle('plan:list', () => plans.list());
  ipcMain.handle('plan:save', (_e, plan) => plans.save(plan));
  ipcMain.handle('plan:remove', (_e, id) => plans.remove(id));
  ipcMain.handle('plan:saveImage', (_e, planId, dataUrl) => plans.saveImage(planId, dataUrl));
  // 工程を1つ AI に頼む（refs / structure / polish / design / tone / cuts）
  ipcMain.handle('plan:step', async (event, plan, step, opts = {}) => {
    const images = step === 'tone' ? plans.toneImages(plan) : [];
    const res = await ask(event.sender, plans.prompts[step](plan, opts.seconds), { web: step === 'refs', images });
    const out = plans.parseStep(step, res.output);
    if (!out) throw new Error(res.error?.trim() || 'AIの答えを読み取れませんでした');
    return out;
  });
  // kind: proposal（企画書。withStoryboard で絵コンテも付ける）/ storyboard / blank（手描き用の空テンプレート）
  ipcMain.handle('plan:pdf', async (_e, plan, kind, opts = {}) => {
    const { planDir, workDir, vault, issuer } = settings.get();
    const label = { proposal: '企画書', storyboard: '絵コンテ', blank: '絵コンテテンプレート' }[kind];
    const r = await dialog.showSaveDialog({
      defaultPath: path.join(planDir || workDir || app.getPath('documents'), `${label}_${(plan.title || '無題').replace(/[\\/:*?"<>|]/g, '')}.pdf`),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (r.canceled) return null;
    await planPdf(plan, kind, { ...opts, author: issuer?.name }, r.filePath);
    settings.set({ planDir: path.dirname(r.filePath) });
    if (kind === 'proposal') try { obsidian.logPlan(vault, plan, r.filePath); } catch (e) { console.error(e); }
    shell.showItemInFolder(r.filePath);
    return r.filePath;
  });
  ipcMain.handle('shell:openUrl', (_e, url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); });
}

module.exports = { registerPlanIpc };
