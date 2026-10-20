// おまかせ振り分け：依頼文に含まれる言葉から、得意分野が近いAIを選ぶ。
// 各CLIコネクタの strengths.keywords を使うので、AIを増やしてもここは変えなくてよい。
function route(prompt, connectors) {
  const text = prompt.toLowerCase();
  const candidates = connectors.filter((c) => c.kind === 'cli' && c.strengths);
  if (!candidates.length) return null;

  const scored = candidates.map((c) => {
    const hits = c.strengths.keywords.filter((k) => text.includes(k.toLowerCase()));
    return { c, hits };
  }).sort((a, b) => b.hits.length - a.hits.length);

  const [best, second] = scored;
  const tie = !best.hits.length || (second && second.hits.length === best.hits.length);
  if (tie) {
    const fallback = candidates.find((c) => c.default) ?? candidates[0];
    return { id: fallback.id, name: fallback.name, reason: '得意分野がはっきりしないので標準のAIに回しました' };
  }
  return {
    id: best.c.id,
    name: best.c.name,
    reason: `${best.c.strengths.label}の依頼と判断（${best.hits.slice(0, 3).join('・')}）`,
  };
}

module.exports = { route };
