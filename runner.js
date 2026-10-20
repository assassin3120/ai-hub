// CLIコネクタを1回実行して、出力をストリームで流しつつ最後にまとめて返す。
const { spawn } = require('child_process');

function runCli(c, prompt, { cwd, onData, web } = {}) {
  return new Promise((resolve) => {
    let output = '';
    let error = '';
    let finished = false;
    const finish = (code) => {
      if (finished) return;
      finished = true;
      resolve({ code, output, error });
    };
    const child = spawn(c.command, c.args(prompt, { web }), { cwd: cwd || undefined, shell: process.platform === 'win32' });
    // 日本語が途中で切れて文字化けしないよう、バイト列ではなく文字列で受け取る
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => { output += d; onData?.('out', String(d)); });
    child.stderr.on('data', (d) => { error += d; onData?.('err', String(d)); });
    child.on('error', (e) => {
      const msg = `${c.command} を起動できません: ${e.message}\n`;
      error += msg;
      onData?.('err', msg);
      finish(-1);
    });
    child.on('close', (code) => finish(code));
  });
}

module.exports = { runCli };
