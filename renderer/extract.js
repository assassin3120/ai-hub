// ブラウザで開いているページから、AIに渡す内容を取り出す（ページの中で実行される）。
//   選択中の文字があればそれだけ / YouTube なら概要欄と字幕 / それ以外は本文
// eslint-disable-next-line no-unused-vars
async function extractPage() {
  const tidy = (s) => s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const base = { title: document.title, url: location.href };

  const selection = String(getSelection() ?? '').trim();
  if (selection.length > 20) return { ...base, kind: 'selection', text: selection };

  if (/(^|\.)youtube\.com$/.test(location.hostname) && location.pathname === '/watch') {
    const res = document.querySelector('#movie_player')?.getPlayerResponse?.() ?? window.ytInitialPlayerResponse;
    const tracks = res?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
    const track = tracks.find((t) => t.languageCode === 'ja' && t.kind !== 'asr')
      ?? tracks.find((t) => t.languageCode === 'ja') ?? tracks.find((t) => t.kind !== 'asr') ?? tracks[0];
    let transcript = '';
    if (track) {
      try {
        const json = await (await fetch(`${track.baseUrl}&fmt=json3`)).json();
        transcript = json.events.filter((e) => e.segs).map((e) => e.segs.map((s) => s.utf8).join('')).join(' ');
      } catch { /* 下の方法を試す */ }
    }
    if (!transcript) {
      // 字幕を直接取れないときは、YouTube の「文字起こし」パネルを開いて読む
      document.querySelector('ytd-video-description-transcript-section-renderer button')?.click();
      for (let i = 0; i < 20 && !document.querySelector('ytd-transcript-segment-renderer'); i++) {
        await new Promise((r) => setTimeout(r, 250));
      }
      transcript = [...document.querySelectorAll('ytd-transcript-segment-renderer .segment-text')]
        .map((s) => s.textContent.trim()).filter(Boolean).join(' ');
    }
    transcript = transcript.replace(/\s+/g, ' ').trim();
    return {
      ...base,
      title: res?.videoDetails?.title ?? base.title,
      kind: 'video',
      hasTranscript: Boolean(transcript),
      text: tidy(`チャンネル: ${res?.videoDetails?.author ?? ''}\n\n概要欄:\n${res?.videoDetails?.shortDescription ?? ''}\n\n字幕:\n${transcript || '（字幕が見つかりませんでした）'}`),
    };
  }

  const main = document.querySelector('article, main, [role=main]') ?? document.body;
  return { ...base, kind: document.querySelector('video') ? 'page-with-video' : 'page', text: tidy(main.innerText) };
}
