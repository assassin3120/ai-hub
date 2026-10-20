// 企画書と絵コンテの HTML を作る。画面のプレビューと PDF の両方で同じものを使う。
// 画面（<script>）と main.js（require）の両方から読み込む。
(function (root) {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // 企画書のデザイン。AI が内容に合わせて選び、画面からも選び直せる。
  const THEMES = {
    clean: { name: 'クリーン', bg: '#ffffff', ink: '#1d1d1f', sub: '#6e6e73', cover: '#ffffff', coverInk: '#1d1d1f', font: '"Hiragino Sans", "Noto Sans JP", sans-serif' },
    bold: { name: 'ボールド', bg: '#ffffff', ink: '#111111', sub: '#666666', cover: '#111111', coverInk: '#ffffff', font: '"Hiragino Sans", "Noto Sans JP", sans-serif' },
    warm: { name: 'ナチュラル', bg: '#faf6ef', ink: '#3a3229', sub: '#8a7d6b', cover: '#efe6d6', coverInk: '#3a3229', font: '"Hiragino Mincho ProN", "Noto Serif JP", serif' },
    film: { name: 'シネマ', bg: '#16171a', ink: '#ececec', sub: '#9a9aa0', cover: '#000000', coverInk: '#ffffff', font: '"Hiragino Sans", "Noto Sans JP", sans-serif' },
  };

  const ASPECTS = { '16:9': 16 / 9, '9:16': 9 / 16, '4:3': 4 / 3, '1:1': 1, '2.39:1': 2.39 };

  // 秒 → 0:03 / 1:05
  const tc = (sec) => { const s = Math.round(Number(sec) || 0); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const totalDur = (cuts) => (cuts || []).reduce((s, c) => s + (Number(c.dur) || 0), 0);

  // 本文：空行で段落、「・」や「- 」で始まる行は箇条書き
  function body(text) {
    const out = [];
    let list = null;
    for (const raw of String(text ?? '').split('\n')) {
      const line = raw.trim();
      const m = line.match(/^(?:[・•\-*]|\d+[.．、)])\s*(.*)$/);
      if (m) { (list ??= []).push(`<li>${esc(m[1])}</li>`); continue; }
      if (list) { out.push(`<ul>${list.join('')}</ul>`); list = null; }
      if (line) out.push(`<p>${esc(line)}</p>`);
    }
    if (list) out.push(`<ul>${list.join('')}</ul>`);
    return out.join('');
  }

  function themeVars(plan) {
    const t = THEMES[plan.theme] ?? THEMES.clean;
    const accent = /^#[0-9a-f]{6}$/i.test(plan.accent || '') ? plan.accent : '#e8453c';
    return `--bg:${t.bg};--ink:${t.ink};--sub:${t.sub};--cover:${t.cover};--cover-ink:${t.coverInk};--accent:${accent};--font:${t.font}`;
  }

  // 企画書：表紙＋1章1ページ（スライド型の A4 横）＋リファレンス
  function proposalHtml(plan, { author = '', withStoryboard = false, imageUrl } = {}) {
    const sections = (plan.sections || []).filter((s) => s.heading || s.body);
    const refs = (plan.refs || []).filter((r) => r.title || r.url);
    const pages = [];
    const total = sections.length + (refs.length ? 1 : 0) + 1;
    const foot = (n) => `<div class="pp-foot"><span>${esc(plan.title)}</span><span>${n} / ${total}</span></div>`;
    pages.push(`<section class="pp-page pp-cover">
      <div class="pp-bar"></div>
      <div class="pp-cover-main">
        ${plan.tagline ? `<div class="pp-tagline">${esc(plan.tagline)}</div>` : ''}
        <h1>${esc(plan.title || '無題の企画')}</h1>
        ${plan.subtitle ? `<div class="pp-subtitle">${esc(plan.subtitle)}</div>` : ''}
      </div>
      <div class="pp-cover-meta"><span>${esc(plan.date || '')}</span><span>${esc(author)}</span></div>
    </section>`);
    sections.forEach((s, i) => {
      pages.push(`<section class="pp-page">
        <div class="pp-num">${String(i + 1).padStart(2, '0')}</div>
        <h2>${esc(s.heading)}</h2>
        <div class="pp-body">${body(s.body)}</div>
        ${foot(i + 2)}
      </section>`);
    });
    if (refs.length) {
      pages.push(`<section class="pp-page">
        <div class="pp-num">REF</div>
        <h2>リファレンス</h2>
        <ol class="pp-refs">${refs.map((r) => `<li><b>${esc(r.title || r.url)}</b>${r.source ? `<span class="src">${esc(r.source)}</span>` : ''}${r.note ? `<div>${esc(r.note)}</div>` : ''}${r.url ? `<div class="url">${esc(r.url)}</div>` : ''}</li>`).join('')}</ol>
        ${foot(total)}
      </section>`);
    }
    const doc = `<div class="proposal" style="${themeVars(plan)}">${pages.join('')}</div>`;
    return withStoryboard && (plan.cuts || []).length ? doc + storyboardHtml(plan, { imageUrl }) : doc;
  }

  // 1ページに入るカット数（縦長の画面ほど少なく）
  const perPage = (aspect) => ((ASPECTS[aspect] ?? 16 / 9) >= 1.3 ? 5 : (ASPECTS[aspect] ?? 1) >= 1 ? 4 : 3);

  // 絵コンテ：A4 縦、左から No・尺・画面・ト書き。blank なら手描き用の空のテンプレート
  function storyboardHtml(plan, { blank = false, pages: blankPages = 2, imageUrl = (p) => p } = {}) {
    const aspect = plan.aspect || '16:9';
    const ratio = ASPECTS[aspect] ?? 16 / 9;
    const n = perPage(aspect);
    const cuts = blank ? Array.from({ length: n * blankPages }, () => ({})) : (plan.cuts || []);
    const rowH = 246 / n; // mm（ヘッダーを除いた高さを割る）
    const frameH = rowH - 6;
    const frameW = Math.min(frameH * ratio, 110);
    const pages = [];
    let start = 0;
    const count = Math.max(1, Math.ceil(cuts.length / n));
    for (let p = 0; p < count; p++) {
      const rows = cuts.slice(p * n, p * n + n).map((c, i) => {
        const no = p * n + i + 1;
        const s = start;
        start += Number(c.dur) || 0;
        const img = c.image ? `<img src="${esc(imageUrl(c.image))}">` : '';
        return `<tr style="height:${rowH}mm">
          <td class="sb-no">${no}</td>
          <td class="sb-dur">${blank ? '' : `<b>${esc(c.dur ?? '')}${c.dur !== undefined && c.dur !== '' ? '<small>秒</small>' : ''}</b><span>${tc(s)}–${tc(start)}</span>`}</td>
          <td class="sb-pic"><div class="sb-frame" style="width:${frameW}mm;height:${frameW / ratio}mm">${img}</div></td>
          <td class="sb-note">${blank ? '' : esc(c.note).replace(/\n/g, '<br>')}</td>
        </tr>`;
      }).join('');
      pages.push(`<section class="sb-page">
        <header><b>${esc(plan.title || '絵コンテ')}</b><span>${blank ? '' : `尺 合計 ${tc(totalDur(cuts))}`}</span><span>${aspect}</span><span>${p + 1} / ${count}</span></header>
        <table><colgroup><col style="width:9mm"><col style="width:20mm"><col style="width:${frameW + 6}mm"><col></colgroup>
          <thead><tr><th>No</th><th>尺</th><th>画面</th><th>ト書き</th></tr></thead><tbody>${rows}</tbody></table>
      </section>`);
    }
    return `<div class="storyboard">${pages.join('')}</div>`;
  }

  const PLAN_CSS = `
.proposal { font-family: var(--font); color: var(--ink); }
.pp-page { position: relative; box-sizing: border-box; width: 297mm; height: 210mm; padding: 22mm 26mm 18mm; background: var(--bg); overflow: hidden; page-break-after: always; break-after: page; }
.pp-cover { background: var(--cover); color: var(--cover-ink); display: flex; flex-direction: column; justify-content: center; }
.pp-bar { position: absolute; left: 26mm; top: 22mm; width: 18mm; height: 2.4mm; background: var(--accent); }
.pp-cover h1 { font-size: 30pt; line-height: 1.3; margin: 0 0 6mm; letter-spacing: .02em; }
.pp-tagline { color: var(--accent); font-size: 12pt; font-weight: 600; margin-bottom: 5mm; letter-spacing: .08em; }
.pp-subtitle { font-size: 13pt; opacity: .75; }
.pp-cover-meta { position: absolute; left: 26mm; right: 26mm; bottom: 18mm; display: flex; justify-content: space-between; font-size: 10pt; opacity: .7; }
.pp-num { color: var(--accent); font-size: 11pt; font-weight: 700; letter-spacing: .1em; }
.pp-page h2 { font-size: 22pt; margin: 2mm 0 9mm; padding-bottom: 4mm; border-bottom: .4mm solid var(--accent); display: inline-block; }
.pp-body { font-size: 12.5pt; line-height: 1.9; max-width: 220mm; }
.pp-body p { margin: 0 0 3mm; }
.pp-body ul { margin: 0 0 3mm; padding-left: 6mm; }
.pp-body li { margin-bottom: 1.5mm; }
.pp-body li::marker { color: var(--accent); }
.pp-foot { position: absolute; left: 26mm; right: 26mm; bottom: 10mm; display: flex; justify-content: space-between; font-size: 8pt; color: var(--sub); }
.pp-refs { font-size: 10pt; line-height: 1.5; columns: 2; column-gap: 12mm; padding-left: 5mm; margin: 0; }
.pp-refs li { break-inside: avoid; margin-bottom: 4mm; }
.pp-refs .src { color: var(--sub); margin-left: 2mm; font-size: 8.5pt; }
.pp-refs .url { color: var(--sub); font-size: 8pt; word-break: break-all; }
.storyboard { font-family: "Hiragino Sans", "Noto Sans JP", sans-serif; color: #222; }
.sb-page { box-sizing: border-box; width: 210mm; height: 297mm; padding: 14mm 12mm 10mm; background: #fff; page-break-after: always; break-after: page; overflow: hidden; }
.sb-page header { display: flex; gap: 6mm; align-items: baseline; font-size: 9pt; color: #666; margin-bottom: 3mm; }
.sb-page header b { font-size: 12pt; color: #222; margin-right: auto; }
.sb-page table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.sb-page th { font-size: 8pt; font-weight: 500; color: #666; border: .3mm solid #333; padding: 1mm; background: #f3f3f3; }
.sb-page td { border: .3mm solid #333; vertical-align: top; padding: 2mm; font-size: 9pt; }
.sb-no { text-align: center; font-weight: 700; }
.sb-dur b { display: block; font-size: 12pt; text-align: center; }
.sb-dur small { font-size: 7pt; font-weight: 400; }
.sb-dur span { display: block; text-align: center; font-size: 7pt; color: #888; margin-top: 1mm; }
.sb-pic { padding: 3mm; }
.sb-frame { box-sizing: border-box; border: .3mm solid #333; background: #fff; overflow: hidden; display: flex; align-items: center; justify-content: center; }
.sb-frame img { width: 100%; height: 100%; object-fit: cover; }
.sb-note { line-height: 1.6; white-space: normal; }
`;

  const api = { THEMES, ASPECTS, tc, totalDur, perPage, proposalHtml, storyboardHtml, PLAN_CSS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.planDoc = api;
})(typeof window !== 'undefined' ? window : globalThis);
