module.exports = {
  id: 'codex', name: 'Codex', icon: '🧩', kind: 'cli', order: 2,
  // OpenAI Codex CLI の非対話モード。
  command: 'codex',
  args: (prompt) => ['exec', prompt],
  strengths: {
    label: 'コードの実装・修正',
    keywords: [
      'コード', '実装', 'プログラム', 'スクリプト', '関数', 'バグ', 'エラー', '直して', '修正', 'デバッグ',
      'テスト', 'リファクタ', 'ビルド', 'コンパイル', 'インストール', 'コマンド', 'ターミナル', 'リポジトリ',
      'python', 'javascript', 'typescript', 'node', 'npm', 'git', 'sql', 'api', 'html', 'css', 'react',
      'fix', 'bug', 'error', 'implement', 'refactor', 'test', '.js', '.py', '.ts',
    ],
  },
};
