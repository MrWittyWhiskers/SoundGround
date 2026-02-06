// ====== VOICEVOX (TTSQuest) ======
(function () {

  // ------------------------------
  // DOM
  // ------------------------------
  const input   = document.getElementById('ttsInput');
  const btn     = document.getElementById('ttsBtn');
  const status  = document.getElementById('ttsStatus');
  const audioEl = document.getElementById('ttsAudio');
  const sel     = document.getElementById('ttsSpeakerSel');
  if (!input || !btn || !status || !audioEl || !sel) return;

  try { audioEl.crossOrigin = 'anonymous'; } catch {}

  // ------------------------------
  // CONFIG
  // ------------------------------
  const SYNTH_URL = 'https://api.tts.quest/v3/voicevox/synthesis';
  const MAX_STATUS_POLLS = 18;
  const MAX_PLAY_RETRY  = 3;
  const MAX_SYNTH_RETRY = 3;

  // ------------------------------
  // FALLBACK SPEAKERS (403 SAFE)
  // ------------------------------
  const FALLBACK_SPEAKERS = [
    { speaker: 12, name: '玄野武宏' },
    { speaker: 13, name: '白上虎太郎' },
    { speaker: 14, name: '青山龍星' },
    { speaker: 18, name: '剣崎雌雄' },
    { speaker: 5,  name: 'ずんだもん' },
    { speaker: 1,  name: '四国めたん' },
  ];

  // Populate speaker select immediately (no API dependency)
  sel.innerHTML = '';
  FALLBACK_SPEAKERS.forEach(s => {
    const o = document.createElement('option');
    o.value = s.speaker;
    o.textContent = `${s.name}（ID:${s.speaker}）`;
    sel.appendChild(o);
  });

  // ------------------------------
  // STATE
  // ------------------------------
  let inflight   = false;
  let queuedText = null;

  // ------------------------------
  // HELPERS
  // ------------------------------
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const setBusy = (busy, msg) => {
    input.disabled = busy;
    btn.disabled   = busy;
    sel.disabled   = busy;
    btn.textContent = busy ? (msg || '生成中…') : '▶ 再生';
  };

  async function fetchJSON(url, opts = {}, retries = 2) {
    for (let i = 0; i <= retries; i++) {
      const res = await fetch(url, opts);
      if (res.status !== 429) {
        const txt = await res.text();
        try { return JSON.parse(txt); }
        catch { throw new Error(txt.slice(0, 160)); }
      }
      await sleep(800 * (i + 1));
    }
    throw new Error('Rate limited (429)');
  }

  async function pollStatus(url) {
    let delay = 700;
    for (let i = 0; i < MAX_STATUS_POLLS; i++) {
      await sleep(delay);
      const s = await fetchJSON(url, {}, 1);
      if (s?.isAudioReady && s?.mp3DownloadUrl) {
        return s.mp3DownloadUrl;
      }
      delay = Math.min(3000, Math.round(delay * 1.25));
    }
    throw new Error('Audio generation timeout');
  }

  async function safePlay(url) {
    audioEl.pause();
    audioEl.removeAttribute('src');
    audioEl.load();

    audioEl.src = url;
    audioEl.currentTime = 0;

    for (let i = 0; i < MAX_PLAY_RETRY; i++) {
      try {
        await audioEl.play();
        return;
      } catch {
        await sleep(300);
      }
    }
    throw new Error('Audio playback failed');
  }

  // ------------------------------
  // CORE TTS (RELIABLE)
  // ------------------------------
  async function synthesize(text) {
    text = text.trim();
    if (!text) {
      status.textContent = 'テキストを入力してください';
      return;
    }

    // Queue if busy (last click wins)
    if (inflight) {
      queuedText = text;
      status.textContent = '待機中…（次を準備）';
      return;
    }

    inflight   = true;
    queuedText = null;

    const speaker = Number(sel.value || 12);
    setBusy(true);
    status.textContent = '音声生成中…';

    try {
      let mp3Url = null;

      // FULL synthesis retry
      for (let attempt = 0; attempt < MAX_SYNTH_RETRY && !mp3Url; attempt++) {
        try {
          const init = await fetchJSON(SYNTH_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
            },
            body: new URLSearchParams({ text, speaker })
          });

          if (init.mp3DownloadUrl) {
            mp3Url = init.mp3DownloadUrl;
          } else if (init.audioStatusUrl) {
            status.textContent = '音声生成中…';
            mp3Url = await pollStatus(init.audioStatusUrl);
          }
        } catch (e) {
          console.warn(`TTS retry ${attempt + 1}`, e.message);
          await sleep(800);
        }
      }

      if (!mp3Url) {
        throw new Error('音声生成に失敗しました');
      }

      status.textContent = '再生中…';
      await safePlay(mp3Url);

      audioEl.onended = () => {
        status.textContent = '待機中';
      };

    } catch (e) {
      console.error(e);
      status.textContent = `失敗: ${e.message}`;
    } finally {
      inflight = false;
      setBusy(false);

      // Run queued request if exists
      if (queuedText) {
        const next = queuedText;
        queuedText = null;
        synthesize(next);
      }
    }
  }

  // ------------------------------
  // UI EVENTS
  // ------------------------------
  btn.addEventListener('click', () => synthesize(input.value));

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      synthesize(input.value);
    }
  });

})();
