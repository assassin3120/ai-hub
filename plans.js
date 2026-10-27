// 企画書・絵コンテの保存（ユーザーデータに JSON と画像）と、AI に頼む各工程のプロンプト
const { app } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { THEMES, FONTS, normalizeTheme } = require('./renderer/plan-doc');

const file = () => path.join(app.getPath('userData'), 'plans.json');
const imageDir = (planId) => path.join(app.getPath('userData'), 'plans', planId);

function list() {
  try { return JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { return []; }
}

function save(plan) {
  const all = list().filter((x) => x.id !== plan.id);
  all.push({ ...plan, updatedAt: new Date().toISOString() });
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(all, null, 2));
  return all;
}

function remove(id) {
  const all = list().filter((x) => x.id !== id);
  fs.writeFileSync(file(), JSON.stringify(all, null, 2));
  fs.rmSync(imageDir(id), { recursive: true, force: true });
  return all;
}

// 絵コンテにはめた絵を保存して、そのファイルのパスを返す
function saveImage(planId, dataUrl) {
  const m = String(dataUrl).match(/^data:image\/(png|jpe?g|gif|webp);base64,(.+)$/);
  if (!m) throw new Error('画像として読めませんでした');
  const out = path.join(imageDir(planId), `${crypto.randomUUID()}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(m[2], 'base64'));
  return out;
}

// トンマナの参考に送った画像のうち、この企画のフォルダに実際にあるものだけ
function toneImages(plan) {
  const dir = imageDir(plan.id);
  return (plan.tone?.images || []).filter((p) => path.dirname(path.resolve(p)) === dir && fs.existsSync(p));
}

const outline = (plan) => JSON.stringify({ title: plan.title, subtitle: plan.subtitle, sections: plan.sections }, null, 1);
const refsText = (plan) => (plan.refs || []).map((r) => `- ${r.title} ${r.url || ''} ${r.note || ''}`).join('\n');
const JSON_ONLY = '出力はJSONだけ。説明文やコードブロックは付けない。';

// 篇が2つ以上ある企画なら、どの篇のカット割りかを伝える
const epNote = (plan) => {
  const eps = plan.episodes || [];
  if (eps.length < 2) return '';
  const cur = eps.find((e) => e.id === plan.ep) ?? eps[0];
  return `この企画には ${eps.map((e) => `「${e.name}」`).join('・')} があり、作るのは「${cur.name}」のカット割り。この篇の内容だけにして、ほかの篇と重ならないようにする。\n`;
};

// 工程ごとのプロンプト。先頭の【】は工程名（ログで見分けやすいように）
const prompts = {
  refs: (plan) => `【リファレンス集め】次の企画の参考になるリファレンスを6〜10件集めてください。
過去の作品（MV・CM・映画・SNS動画など）、演出やデザインの参考、裏付けになる記事やデータを混ぜる。
Web検索が使えるなら実際に調べて、本当にあるページのURLを入れる。確かでないURLは作らず空にする。
note には「この企画のどこに効くか」を1文で書く。
${JSON_ONLY}
形式: {"refs":[{"title":"作品名・記事名","url":"https://...","source":"YouTube や媒体名","note":"参考にする点"}]}

企画メモ:
${plan.memo}
${plan.refs?.length ? `\nすでにあるリファレンス（重複させない）:\n${refsText(plan)}` : ''}`,

  structure: (plan) => `【構成】次のメモとリファレンスから、企画書の構成と本文を作ってください。
映像・クリエイティブの企画書として、背景・課題／目的／コンセプト／ターゲット／表現・演出案／構成案／スケジュール／体制・予算 などから、この企画に必要な章だけを選ぶ（4〜8章）。
1章はスライド1枚に収まる量にする（本文は200字前後。箇条書きは行頭に「・」）。メモにない数字や固有名詞は作らず「（要確認）」と書く。
${JSON_ONLY}
形式: {"title":"企画タイトル","subtitle":"ひとことで何をするか","sections":[{"heading":"章タイトル","body":"本文"}]}

企画メモ:
${plan.memo}
${plan.refs?.length ? `\nリファレンス:\n${refsText(plan)}` : ''}
${plan.sections?.length ? `\nいまの下書き（活かせるところは活かす）:\n${outline(plan)}` : ''}`,

  polish: (plan) => `【推敲】次の企画書の文章を推敲してください。
読み手は決裁者やクライアント。言い切りで短く、同じ言い回しの重複をなくし、章の順番が話の流れになるよう整える。
事実や数字は変えない。表紙に載せる、企画の核を一言で表すキャッチコピー（tagline、20字以内）も作る。
${JSON_ONLY}
形式: {"title":"…","subtitle":"…","tagline":"…","sections":[{"heading":"…","body":"…"}]}

企画書:
${outline(plan)}`,

  design: (plan) => `【デザイン】次の企画書に合う見た目を選んでください。
theme は ${Object.entries(THEMES).map(([k, t]) => `${k}（${t.name}）`).join('、')} のどれか。accent は企画の雰囲気に合う差し色を #rrggbb で。
${JSON_ONLY}
形式: {"theme":"clean","accent":"#e8453c"}

企画書:
${outline(plan)}`,

  tone: (plan) => {
    const images = toneImages(plan);
    return `【トンマナ】送られた雰囲気から、この企画書のトンマナ（色・書体・飾り）を作ってください。
${images.length ? `参考画像（Read ツールで1枚ずつ開いて、色・文字の雰囲気・線や影・余白の取り方を読み取る）:\n${images.map((p) => `- ${p}`).join('\n')}\n` : ''}${plan.tone?.words ? `言葉での指定:\n${plan.tone.words}\n` : ''}
色はすべて #rrggbb。bg は本文ページの地、ink は文字、sub は小さな注記、cover と coverInk は表紙の地と文字、accent と accent2 は差し色。文字と地のコントラストは十分にとる。
font は ${Object.keys(FONTS).join(' / ')}、headingCase は none / upper、headingWeight は 300〜900、border は none / thin / thick、shadow は none / soft / hard（hard はずらした黒い影）、radius は角丸（mm、0〜12）、coverLayout は left / center / split / block。
name はこのトンマナの短い名前、note は「どこをどう読み取ったか」を1〜2文で。
${JSON_ONLY}
形式: {"name":"…","bg":"#ffffff","ink":"#111111","sub":"#666666","cover":"#111111","coverInk":"#ffffff","accent":"#e8453c","accent2":"#ffd000","font":"sans","headingCase":"none","headingWeight":800,"border":"none","shadow":"none","radius":0,"coverLayout":"left","note":"…"}

企画書:
${outline(plan)}`;
  },

  // 企画からまとめて絵コンテを作る。篇がいくつあるかも企画から読み取る（すでに名前の付いた篇があればそれに合わせる）
  board: (plan) => {
    const named = (plan.episodes || []).filter((e) => e.name && e.name !== '本編');
    return `【絵コンテ】次の企画を、映像の絵コンテに起こしてください。
企画に複数の篇（A篇・B篇、15秒版・30秒版、シリーズの各話など）があれば篇ごとに分け、なければ1つの篇（name は「本編」）にする。
${named.length ? `すでにある篇：${named.map((e) => `「${e.name}」`).join('・')}。この名前を使う（足りない篇があれば足してよい）。\n` : ''}篇ごとに、尺（秒。企画に書いてあればそれ、なければ内容に合う長さ）、画面比（16:9 / 9:16 / 4:3 / 1:1 / 2.39:1。縦型SNSなら 9:16）、カット割りを書く。
1カットごとに尺（秒）と、ト書き（画面に映るもの・カメラワーク・テロップ・音）と、セリフやナレーション（line。話す人がいれば「名前：セリフ」、なければ空）を書く。カットの尺の合計は篇の尺に合わせる。
${JSON_ONLY}
形式: {"episodes":[{"name":"A篇","seconds":30,"aspect":"16:9","cuts":[{"dur":3,"note":"ト書き","line":"名前：セリフ"}]}]}

企画書:
${outline(plan)}
${plan.memo ? `\n企画メモ:\n${plan.memo}` : ''}`;
  },

  // 投げ込まれた企画書のファイルを読んで、企画メモにする
  readDoc: (file) => `【企画の読み込み】次のファイルを Read で読んで、映像の企画メモにまとめてください。
案件名・目的・ターゲット・尺や本数・篇（バージョン）・媒体・トンマナ・決まっている演出やセリフ・スケジュールや予算など、書いてあることは落とさず、日本語の箇条書きで。書いていないことは足さない。メモの本文だけを出力。

ファイル: ${file}`,

  cuts: (plan, seconds) => `【カット割り】次の企画から、映像の絵コンテのカット割りを作ってください。
${epNote(plan)}${seconds ? `全体の尺はおよそ${seconds}秒。` : ''}1カットごとに尺（秒）と、ト書き（画面に映るもの・カメラワーク・テロップ・音）と、セリフやナレーション（line。話す人がいれば「名前：セリフ」、なければ空）を書く。
${JSON_ONLY}
形式: {"cuts":[{"dur":3,"note":"ト書き","line":"名前：セリフ"}]}

企画書:
${outline(plan)}
${plan.memo ? `\n企画メモ:\n${plan.memo}` : ''}`,
};

function parseJson(text) {
  try { return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); } catch { return null; }
}

const str = (v) => String(v ?? '');
const sections = (j) => (Array.isArray(j.sections) ? j.sections : []).map((s) => ({ heading: str(s.heading), body: str(s.body) })).filter((s) => s.heading || s.body);

// AI の答えを、企画に上書きする項目だけにして返す
const parsers = {
  refs: (j) => ({ refs: (Array.isArray(j.refs) ? j.refs : []).map((r) => ({ title: str(r.title), url: /^https?:\/\//.test(r.url) ? r.url : '', source: str(r.source), note: str(r.note) })) }),
  structure: (j) => ({ title: str(j.title), subtitle: str(j.subtitle), sections: sections(j) }),
  polish: (j) => ({ title: str(j.title), subtitle: str(j.subtitle), tagline: str(j.tagline), sections: sections(j) }),
  design: (j) => ({ theme: THEMES[j.theme] ? j.theme : 'clean', accent: /^#[0-9a-f]{6}$/i.test(j.accent) ? j.accent : '#e8453c' }),
  tone: (j) => { const t = normalizeTheme(j); return { theme: 'custom', customTheme: t, accent: t.accent }; },
  board: (j) => ({ episodes: (Array.isArray(j.episodes) ? j.episodes : []).map((e) => ({
    name: str(e.name) || '本編',
    seconds: Number(e.seconds) || 0,
    aspect: ['16:9', '9:16', '4:3', '1:1', '2.39:1'].includes(e.aspect) ? e.aspect : '16:9',
    cuts: (Array.isArray(e.cuts) ? e.cuts : []).map((c) => ({ id: crypto.randomUUID(), dur: Number(c.dur) || 0, note: str(c.note), line: str(c.line) })),
  })).filter((e) => e.cuts.length) }),
  cuts: (j) => ({ cuts: (Array.isArray(j.cuts) ? j.cuts : []).map((c) => ({ id: crypto.randomUUID(), dur: Number(c.dur) || 0, note: str(c.note), line: str(c.line) })) }),
};

function parseStep(step, text) {
  const j = parseJson(text);
  return j ? parsers[step](j) : null;
}

module.exports = { list, save, remove, saveImage, toneImages, prompts, parseStep };
