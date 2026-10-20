module.exports = {
  id: 'claude', name: 'Claude', icon: '✳️', kind: 'cli', order: 1,
  // Claude Code の非対話モード。ログイン済みの claude CLI を使う。
  command: 'claude',
  args: (prompt) => ['-p', prompt],
};
