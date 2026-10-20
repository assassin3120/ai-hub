module.exports = {
  id: 'claude', name: 'Claude', icon: '✳️', kind: 'cli', order: 1,
  // Claude Code の非対話モード。ログイン済みの claude CLI を使う。
  command: 'claude',
  args: (prompt) => ['-p', prompt],
  // おまかせ振り分けで使う得意分野。どちらにも当てはまらないときは default のAIに回す。
  default: true,
  strengths: {
    label: '文章・調査・企画',
    keywords: [
      '文章', '文書', '書いて', '要約', 'まとめ', '翻訳', '添削', '校正', 'メール', '手紙', 'ブログ', '記事',
      '企画', 'アイデア', '提案', '計画', '戦略', '調べて', '調査', 'リサーチ', '比較', '説明', '教えて',
      '相談', 'レビュー', '分析', 'なぜ', '考えて', '設計', '仕様', 'summarize', 'translate', 'write', 'explain', 'plan',
    ],
  },
};
