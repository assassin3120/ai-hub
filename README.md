# AI Hub（プロトタイプ）

Claude・Codex・普段使いのアプリを、左のサイドバーから切り替えて1つのウィンドウで使えるデスクトップアプリ。

## コンセプト
- **1つのウィンドウで完結**：AIとのチャットも、Gmail・Notion・カレンダーなどのアプリも、同じ画面の中で切り替えて使える。
- **アプリはプラグイン（コネクタ）として追加**：`connectors/` にファイルを1つ足すだけで、サイドバーにアプリが増える。
- **ログインはそのまま使う**：Claude / Codex はPCにログイン済みのCLIを呼び出す。Webアプリはアプリごとにログイン状態を保持する。

## アーキテクチャ
```
Electron
├─ main.js        … コネクタを読み込み、CLIを実行して出力をストリームで返す
├─ preload.js     … 画面からは安全なAPI（window.hub）だけを使えるようにする
├─ renderer/      … サイドバーと各アプリの画面
└─ connectors/    … アプリ1つにつきファイル1つ
     kind: "cli"  → チャット画面（claude -p / codex exec）
     kind: "web"  → Webアプリを埋め込み（webview）
```

### 今後のコネクタ種別（案）
- `api`：Anthropic / OpenAI のAPIを直接呼ぶ（CLIなしで使いたい場合）
- `mcp`：MCPサーバーとつなぎ、AIから他のアプリを操作できるようにする
- 横断機能：全アプリ共通のコマンドパレット（⌘K）、AIへの「今見ている画面」の受け渡し

## Electron を選んだ理由
Claude Code・Codex のCLIは Node.js 製なので同じ言語で扱いやすく、Webアプリの埋め込み（webview）も標準で使えるため。
Tauri はアプリが軽い反面、Rust が必要でWebアプリ埋め込みの制約も多いので、まずは作りやすさを優先した。

## 動かし方（Mac）
```
npm install
npm start
```
Claude / Codex を使うには、`claude` と `codex` のCLIをインストールしてログインしておく。

## アプリを追加する例
`connectors/slack.js`
```js
module.exports = { id: 'slack', name: 'Slack', icon: '💬', kind: 'web', order: 13, url: 'https://app.slack.com' };
```
