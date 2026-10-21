// Finder から起動すると PATH にシェルの設定が入らず claude / codex が見つからないので、ログインシェルから取り直す
const { execFileSync } = require('child_process');

function fixPath() {
  if (process.platform !== 'darwin') return;
  try {
    const out = execFileSync(process.env.SHELL || '/bin/zsh', ['-ilc', 'printf "__PATH__%s" "$PATH"'], { encoding: 'utf8', timeout: 5000 });
    const p = out.split('__PATH__').pop();
    if (p) process.env.PATH = p;
  } catch { /* 取れなければ今の PATH のまま */ }
}

module.exports = { fixPath };
