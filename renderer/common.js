// ハブと単独アプリ（企画・絵コンテ）の両方で使う小さな道具
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const today = () => new Date().toLocaleDateString('sv-SE');

// 明るい／暗い表示。auto は Mac の設定に合わせる。選んだものはこのアプリに覚えておく
const THEME_MODES = ['auto', 'light', 'dark'];
const THEME_LABEL = { auto: '◐', light: '☀︎', dark: '☾' };
const THEME_TITLE = { auto: '表示：Mac の設定に合わせる（押すとライト）', light: '表示：ライト（押すとダーク）', dark: '表示：ダーク（押すと自動）' };
const getTheme = () => { try { return THEME_MODES.includes(localStorage.theme) ? localStorage.theme : 'auto'; } catch { return 'auto'; } };
const applyTheme = (mode = getTheme()) => {
  if (mode === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = mode;
};
const nextTheme = () => {
  const mode = THEME_MODES[(THEME_MODES.indexOf(getTheme()) + 1) % THEME_MODES.length];
  try { localStorage.theme = mode; } catch { /* 覚えられなくても切り替えはする */ }
  applyTheme(mode);
  return mode;
};
applyTheme();
