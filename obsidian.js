// Obsidian 連携：保管庫（vault）の「AI Hub」フォルダに会話を Markdown で書き出す。
//   AI Hub/2026-10-20/Claude.md          … その日の Claude との会話（追記）
//   AI Hub/2026-10-20/司令塔 1342 ….md    … 司令塔に出した依頼と各担当の結果
//   AI Hub/履歴/Claude Code/….md         … 取り込んだ過去のセッション（1セッション1ノート）
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = 'AI Hub';
const pad = (n) => String(n).padStart(2, '0');
const day = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const safeName = (s) => s.replace(/[\\/:*?"<>|#^[\]\r\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) || '無題';

function append(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, text);
}

function logConversation(vault, { name, via, from = 'あなた', prompt, output, at = new Date() }) {
  if (!vault) return;
  const file = path.join(vault, ROOT, day(at), `${name}.md`);
  const head = fs.existsSync(file) ? '' : `# ${name} ${day(at)}\n`;
  append(file, `${head}\n## ${hm(at)}${via ? ` · ${via}` : ''}\n\n**${from}**\n\n${prompt.trim()}\n\n**${name}**\n\n${output.trim()}\n`);
}

function logOrchestration(vault, { request, tasks, results, summary, names, at = new Date() }) {
  if (!vault) return null;
  const file = path.join(vault, ROOT, day(at), `司令塔 ${hm(at).replace(':', '')} ${safeName(request)}.md`);
  const link = (id) => `[[${ROOT}/${day(at)}/${names[id] ?? id}|${names[id] ?? id}]]`;
  append(file, [
    `# ${request.split('\n')[0].slice(0, 80)}`,
    `\n${day(at)} ${hm(at)}\n\n## 依頼\n\n${request.trim()}`,
    `\n## 作業の割り振り\n\n${tasks.map((t, i) => `${i + 1}. **${t.title}** → ${link(t.assignee)}${results[i]?.code === 0 ? '' : '（失敗）'}`).join('\n')}`,
    ...tasks.map((t, i) => `\n## ${i + 1}. ${t.title}（${names[t.assignee] ?? t.assignee}）\n\n${(results[i]?.output || results[i]?.error || '').trim()}`),
    `\n## まとめ\n\n${(summary || '').trim()}\n`,
  ].join('\n'));
  return file;
}

// ---- 過去の会話の取り込み ----

function* jsonlFiles(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* jsonlFiles(p);
    else if (e.name.endsWith('.jsonl')) yield p;
  }
}

function readJsonl(file) {
  return fs.readFileSync(file, 'utf8').split('\n').flatMap((line) => {
    try { return line.trim() ? [JSON.parse(line)] : []; } catch { return []; }
  });
}

const textOf = (content) => (typeof content === 'string' ? content
  : Array.isArray(content) ? content.filter((p) => ['text', 'input_text', 'output_text'].includes(p?.type)).map((p) => p.text).join('\n')
    : '');

// 「<」で始まるのはツールが自動で差し込む文脈（コマンド・環境情報など）なので記録しない
const isNoise = (text) => !text.trim() || text.trimStart().startsWith('<') || text.startsWith('# AGENTS.md');

// 連続した同じ話者のメッセージは1つにまとめる
function mergeTurns(messages) {
  return messages.reduce((acc, m) => {
    const last = acc[acc.length - 1];
    if (last && last.role === m.role) last.text += `\n\n${m.text}`;
    else acc.push({ ...m });
    return acc;
  }, []);
}

function claudeCodeSessions(home) {
  return [...jsonlFiles(path.join(home, '.claude', 'projects'))].map((file) => {
    const lines = readJsonl(file);
    const messages = lines
      .filter((l) => (l.type === 'user' || l.type === 'assistant') && !l.isMeta && !l.isSidechain)
      .map((l) => ({ role: l.type, text: textOf(l.message?.content), at: l.timestamp }))
      .filter((m) => !isNoise(m.text));
    return { tool: 'Claude Code', id: path.basename(file, '.jsonl'), cwd: lines.find((l) => l.cwd)?.cwd, messages: mergeTurns(messages) };
  });
}

function codexSessions(home) {
  return [...jsonlFiles(path.join(home, '.codex', 'sessions'))].map((file) => {
    const lines = readJsonl(file);
    const items = lines.map((l) => ({ ...(l.payload ?? l), at: l.timestamp }));
    const messages = items
      .filter((it) => it.type === 'message' && (it.role === 'user' || it.role === 'assistant'))
      .map((it) => ({ role: it.role, text: textOf(it.content), at: it.at }))
      .filter((m) => !isNoise(m.text));
    return { tool: 'Codex', id: path.basename(file, '.jsonl'), cwd: items.find((it) => it.cwd)?.cwd, messages: mergeTurns(messages) };
  });
}

function writeSession(vault, s) {
  const first = s.messages.find((m) => m.role === 'user');
  if (!first) return false;
  const at = new Date(s.messages[0].at || Date.now());
  const title = safeName(first.text);
  const file = path.join(vault, ROOT, '履歴', s.tool, `${day(at)} ${title} (${s.id.slice(-8)}).md`);
  const body = s.messages.map((m) => `### ${m.role === 'user' ? 'あなた' : s.tool}${m.at ? ` (${hm(new Date(m.at))})` : ''}\n\n${m.text.trim()}`).join('\n\n');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // セッションが続いていれば内容が増えるので、取り込むたびに書き直す
  fs.writeFileSync(file, `---\nsource: ${s.tool}\nsession: ${s.id}\ncwd: ${JSON.stringify(s.cwd ?? '')}\ndate: ${day(at)}\n---\n\n# ${title}\n\n${body}\n`);
  return true;
}

function importHistory(vault, home = os.homedir()) {
  const counts = {};
  for (const s of [...claudeCodeSessions(home), ...codexSessions(home)]) {
    if (writeSession(vault, s)) counts[s.tool] = (counts[s.tool] ?? 0) + 1;
  }
  return counts;
}

// 請求書を書き出したら、一覧で振り返れるよう1件1ノート残す（同じ番号は上書き）
function logInvoice(vault, inv, c, pdfPath) {
  if (!vault) return;
  const file = path.join(vault, ROOT, '請求書', `${inv.number} ${safeName(inv.client || '')}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const yen = (n) => `¥${Math.round(n).toLocaleString('ja-JP')}`;
  fs.writeFileSync(file, `---\nnumber: ${inv.number}\nclient: ${JSON.stringify(inv.client || '')}\ndate: ${inv.date}\ndue: ${inv.dueDate || ''}\namount: ${c.due}\n---\n\n# ${inv.number} ${inv.client || ''}\n\n${inv.subject ? `件名：${inv.subject}\n\n` : ''}| 品目 | 数量 | 単価 | 税率 |\n|---|---|---|---|\n${c.items.map((it) => `| ${it.name} | ${it.qty}${it.unit || ''} | ${yen(it.price)} | ${it.rate ?? 10}% |`).join('\n')}\n\n- 小計 ${yen(c.subtotal)} / 消費税 ${yen(c.tax)} / 合計 ${yen(c.total)}${c.wh ? ` / 源泉徴収 −${yen(c.wh)}` : ''}\n- **ご請求額 ${yen(c.due)}**\n- PDF: file://${encodeURI(pdfPath)}\n`);
}

module.exports = { ROOT, logConversation, logOrchestration, importHistory, logInvoice };
