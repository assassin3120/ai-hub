module.exports = {
  id: 'codex', name: 'Codex', icon: '🧩', kind: 'cli', order: 2,
  // OpenAI Codex CLI の非対話モード。
  command: 'codex',
  args: (prompt) => ['exec', prompt],
};
