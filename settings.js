// アプリの設定（作業フォルダ・Obsidian の保管庫など）をユーザーデータに JSON で保存する
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const file = () => path.join(app.getPath('userData'), 'settings.json');
let cache;

function get() {
  if (!cache) {
    try { cache = JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { cache = {}; }
  }
  return cache;
}

function set(patch) {
  cache = { ...get(), ...patch };
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(cache, null, 2));
  return cache;
}

module.exports = { get, set };
