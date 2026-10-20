// コネクタ = ハブに並ぶ「アプリ」1つ分。kind で動き方が決まる。
//   cli : ローカルCLIをチャットとして使う（Claude Code, Codex など）
//   web : 既存のWebアプリをそのまま埋め込む（Gmail, Notion, Slack など）
// 新しいアプリは、このフォルダにファイルを1つ足すだけで追加できる。
const fs = require('fs');
const path = require('path');

function loadConnectors() {
  return fs.readdirSync(__dirname)
    .filter((f) => f.endsWith('.js') && f !== 'index.js')
    .map((f) => require(path.join(__dirname, f)))
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
}

module.exports = { loadConnectors };
