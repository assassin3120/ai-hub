// 司令塔：1つの依頼を担当ごとの作業に分け、依存関係の順に各担当へ回し、最後にまとめる。
// 実行そのものは run(担当id, 指示, オプション) に任せるので、Electron に依存しない。
const { route } = require('./router');

const MAX_TASKS = 5;

const planPrompt = (request, members) => `あなたはチームの司令塔です。次の依頼を、担当者ごとの作業に分けてください。

担当者:
${members.map((m) => `- ${m.id}: ${m.name}（得意: ${m.strengths?.label ?? '汎用'}）`).join('\n')}

ルール:
- 作業は1〜${MAX_TASKS}個。分ける必要がなければ1個でよい。
- 各作業は、担当者がそれだけを読めば実行できる具体的な指示にする。
- 前の作業の結果が必要なら dependsOn にその作業の番号（0始まり）を入れる。
- 出力はJSONだけ。説明文やコードブロックは付けない。

形式: {"tasks":[{"assignee":"担当者id","title":"短い作業名","instruction":"具体的な指示","dependsOn":[]}]}

依頼:
${request}`;

function parsePlan(text, members, fallbackId) {
  try {
    const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    const ids = new Set(members.map((m) => m.id));
    const tasks = json.tasks
      .filter((t) => t && t.instruction)
      .slice(0, MAX_TASKS)
      .map((t, i) => ({
        assignee: ids.has(t.assignee) ? t.assignee : fallbackId,
        title: String(t.title || `作業${i + 1}`),
        instruction: String(t.instruction),
        // 自分より前の作業だけを依存先にできるので、循環は起きない
        dependsOn: (Array.isArray(t.dependsOn) ? t.dependsOn : []).filter((d) => Number.isInteger(d) && d >= 0 && d < i),
      }));
    return tasks.length ? tasks : null;
  } catch {
    return null;
  }
}

const taskPrompt = (task, deps) => (deps.length
  ? `${task.instruction}\n\n参考：前の担当者の作業結果\n${deps.map((d) => `### ${d.title}\n${d.output}`).join('\n\n')}`
  : task.instruction);

const summaryPrompt = (request, tasks, results) => `あなたはチームの司令塔です。依頼に対して各担当者が作業しました。結果をまとめて、依頼者への最終回答を書いてください。

依頼:
${request}

${tasks.map((t, i) => `## ${t.title}（担当: ${t.assignee}）\n${results[i]?.output || results[i]?.error || '(結果なし)'}`).join('\n\n')}`;

async function orchestrate({ request, members, leaderId, run, emit = () => {} }) {
  emit({ type: 'planning' });
  const fallbackId = route(request, members)?.id ?? leaderId;
  const plan = await run(leaderId, planPrompt(request, members), { silent: true });
  const tasks = parsePlan(plan.output, members, fallbackId)
    ?? [{ assignee: fallbackId, title: '依頼', instruction: request, dependsOn: [] }];
  emit({ type: 'plan', tasks });

  const results = [];
  const started = {};
  const exec = (i) => {
    started[i] ??= (async () => {
      const deps = await Promise.all(tasks[i].dependsOn.map(exec));
      emit({ type: 'status', index: i, status: 'running' });
      const res = await run(tasks[i].assignee, taskPrompt(tasks[i], deps), { task: tasks[i] });
      results[i] = res;
      emit({ type: 'status', index: i, status: res.code === 0 ? 'done' : 'failed' });
      return { title: tasks[i].title, output: res.output || res.error };
    })();
    return started[i];
  };
  await Promise.all(tasks.map((_, i) => exec(i)));

  let summary = results[0]?.output ?? '';
  if (tasks.length > 1) {
    emit({ type: 'summarizing' });
    summary = (await run(leaderId, summaryPrompt(request, tasks, results), { summary: true })).output;
  }
  emit({ type: 'done' });
  return { tasks, results, summary };
}

module.exports = { orchestrate, parsePlan };
