// ハブと単独アプリ（企画・絵コンテ）の両方で使う小さな道具
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const today = () => new Date().toLocaleDateString('sv-SE');
