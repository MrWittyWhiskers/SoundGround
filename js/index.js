import * as backend from './backend-integration.js';

import * as ui from './ui.js';
import { initRecorder } from './recorder.js';
import { initBackendHandlers, loadBasicPreset, applyPreset } from './backend-handlers.js';
import { initGlobalListeners } from './listeners.js';
import * as looper from './looper.js';
import * as drumMachine from './drum-machine.js';
import * as metronome from './metronome.js';
import * as store from './store.js';
import './voicevox.js';

// --- アプリケーションの初期化 ---

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

let currentUser = null;

// 1. UIを生成
ui.createKeyboard();
ui.createPads();
ui.updatePadsUI();
ui.initPresetTabs();

// 2. 録音機能を初期化
initRecorder();

// 3. バックエンド連携を初期化 (エラーをキャッチ)
try {
    initBackendHandlers();
} catch (error) {
    console.error("バックエンド（Firestore）の初期化に失敗しました:", error);
    alert("データベースに接続できません。プリセットや録音の保存・読込はできませんが、シンセサイザーは使用できます。");
}

// 3.5. 基本プリセットの読み込みと適用
async function loadAndApplyBasicPreset() {
    console.log("App: Starting to load basic preset..."); // 動作確認用ログ
    try {
        const presetData = await loadBasicPreset('basic-cat-set'); 

        if (presetData) {
            // UIモジュールに音源URLを設定
            if (typeof ui.displayBasicPresetsList === 'function') {
                ui.displayBasicPresetsList(presetData, applyPreset);
            }
            
            // 実際に音源をダウンロードして適用
            // backend-handlers.js からインポートされている applyPreset を使う
            if (typeof applyPreset === 'function') {
                await applyPreset(presetData);
            }

            ui.updatePadsUI(); // UIの更新
            
            if (drumMachine && typeof drumMachine.updateSounds === 'function') {
                drumMachine.updateSounds(presetData);
            }
            console.log("Cat Basic Preset Loaded.");
        } else {
            ui.updatePadsUI(); 
        }
    } catch (error) {
        console.error("App: Failed to load initial preset:", error);
    }
}

loadAndApplyBasicPreset();

// --- 1. ログイン時のUI更新 ---
function showLoggedInUI(user) {
  const loginBtn = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const userInfo = document.getElementById('user-info');
  const userName = document.getElementById('user-name');

  if (userInfo) userInfo.style.display = 'flex';
  if (loginBtn) loginBtn.style.display = 'none';
  if (userName) userName.textContent = user.displayName;

  // プリセット関連の表示制御
  const presetLoginPrompt = document.getElementById('preset-login-prompt');
  const presetControls = document.getElementById('preset-controls');
  if (presetLoginPrompt) presetLoginPrompt.style.display = 'none';
  if (presetControls) presetControls.style.display = 'block';

  console.log("UI updated for logged-in user:", user.displayName);
}

// --- 2. ログアウト時のUI更新 ---
function showLoggedOutUI() {
  const loginBtn = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const userInfo = document.getElementById('user-info');

  if (userInfo) userInfo.style.display = 'none';
  if (loginBtn) loginBtn.style.display = 'block';

  const presetLoginPrompt = document.getElementById('preset-login-prompt');
  const presetControls = document.getElementById('preset-controls');
  if (presetLoginPrompt) presetLoginPrompt.style.display = 'block';
  if (presetControls) presetControls.style.display = 'none';

  console.log("UI updated for logged-out state.");
}

// 4. グローバルなイベントリスナーを初期化
initGlobalListeners();

// 5. メトロノームのリスナー
const metroBtn = document.getElementById('metronome-toggle');
metroBtn.addEventListener('click', () => {
    const isPlaying = metronome.toggle();
    if (isPlaying) {
        metroBtn.textContent = 'ON';
        metroBtn.style.backgroundColor = '#4CAF50';
    } else {
        metroBtn.textContent = 'OFF';
        metroBtn.style.backgroundColor = '#607d8b';
    }
});

// 6. ルーパーの初期化とリスナー
looper.init(metroBtn); // metroBtn を渡す
const looperToggleBtn = document.getElementById('looper-toggle');
const looperClearBtn = document.getElementById('looper-clear');

looperToggleBtn.addEventListener('click', () => {
    looper.toggle();
});

looperClearBtn.addEventListener('click', () => {
    looper.clear();
});

looper.onStateChange((state) => {
    looperToggleBtn.classList.remove('waiting', 'playing');
    looperToggleBtn.classList.remove('recording');

    switch (state) {
        case 'IDLE':
            looperToggleBtn.textContent = '録音';
            break;
        case 'WAITING':
            looperToggleBtn.textContent = '録音待機中...';
            looperToggleBtn.classList.add('waiting');
            break;
        case 'RECORDING':
            looperToggleBtn.textContent = '録音中 (重ね録り)';
            looperToggleBtn.classList.add('playing');
            break;
    }
});

// 7. ドラムマシンを初期化
drumMachine.init();

console.log("8bit Synthesizer Initialized.");

// =======================================================
//               アプリケーションの初期化
// =======================================================
// 認証状態の変更を監視して、UIを切り替える
backend.onAuthStateChangedHandler(user => {
  if (user) {
    currentUser = user;
    showLoggedInUI(user);
  } else {
    currentUser = null;
    showLoggedOutUI();
  }
});

// =========================
// MODE / PRESET SLIDER (3 modes: 0=synth, 1=gojuon, 2=game)
// =========================

const modeSlider = document.getElementById("mode-slider");
const modeName   = document.getElementById("mode-name");
const pageSynth  = document.getElementById("page-synth");
const pageGojuon = document.getElementById("page-gojuon");
const pageGame   = document.getElementById("page-game");

let previousMode = 0;

function showOnlyPage(target, direction) {
  document.querySelectorAll(".mode-page").forEach(p => {
    p.classList.remove(
      "mode-page-active",
      "mode-enter-left",
      "mode-enter-right"
    );
    p.style.display = "none";
  });

  if (!target) return;

  target.style.display = "block";

  // add direction before activating
  if (direction === "right") {
    target.classList.add("mode-enter-right");
  } else if (direction === "left") {
    target.classList.add("mode-enter-left");
  }
  target.offsetHeight;
  target.classList.add("mode-page-active");
}

function setModeFromValue(val) {
  const v = parseInt(val, 10) || 0;
  if (!pageSynth || !pageGojuon || !pageGame) return;

  const direction =
    v > previousMode ? "right" :
    v < previousMode ? "left"  :
    null;

  if (v === 0) {
    showOnlyPage(pageSynth, direction);
    if (modeName) modeName.textContent = " 8bitシンセ";
  } else if (v === 1) {
    showOnlyPage(pageGojuon, direction);
    if (modeName) modeName.textContent = " 五十音モード";
  } else if (v === 2) {
    showOnlyPage(pageGame, direction);
    if (modeName) modeName.textContent = " メロディゲーム";
  }

  previousMode = v;
}

if (modeSlider) {
  modeSlider.addEventListener("input", () => {
    setModeFromValue(modeSlider.value);
  });

    modeSlider.addEventListener("change", () => {
    modeSlider.value = Math.round(modeSlider.value);
    setModeFromValue(modeSlider.value);
  });

  // initial state
  setModeFromValue(modeSlider.value || 0);
}

// ===============================
// GOJUON TEXT READER
// ===============================

const gojuonTextInput = document.getElementById('gojuon-text');
const gojuonReadBtn   = document.getElementById('gojuon-read-btn');

// 既存の「kana-key」を使って再生する
function playKana(hira) {
  const btn = document.querySelector(
    `.kana-key[data-hira="${hira}"]`
  );
  if (!btn) return;

  btn.classList.add('active');
  btn.click(); // ← 既存の再生ロジックを使う

  setTimeout(() => {
    btn.classList.remove('active');
  }, 150);
}

[
  'gojuon-text',
  'ttsInput'
].forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;

  el.addEventListener('keydown', e => {
    e.stopPropagation();
  });
});





gojuonReadBtn.addEventListener('click', async () => {
  if (!gojuonTextInput.value) return;

  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }

  const text = gojuonTextInput.value
    .replace(/\s+/g, '')      // 空白除去
    .split('');               // 1文字ずつ

  let index = 0;

  function readNext() {
    if (index >= text.length) return;

    const char = text[index];

    // ひらがな以外はスキップ（記号・漢字など）
    if (!/^[ぁ-ゖ]$/.test(char)) {
      index++;
      readNext();
      return;
    }

    playKana(char);
    index++;

    // 次の文字までの間隔（調整可）
    setTimeout(readNext, 300);
  }

  readNext();
});


// =====================
// Gojuon Sound Board (for 五十音 preset page)
// =====================

const gojuonCharacters = [
  'あ','い','う','え','お',
  'か','き','く','け','こ',
  'さ','し','す','せ','そ',
  'た','ち','つ','て','と',
  'な','に','ぬ','ね','の',
  'は','ひ','ふ','へ','ほ',
  'ま','み','む','め','も',
  'や','ゆ','よ',
  'ら','り','る','れ','ろ',
  'わ','を','ん',
  'が','ぎ','ぐ','げ','ご',
  'ざ','じ','ず','ぜ','ぞ',
  'だ','で','ど',
  'ば','び','ぶ','べ','ぼ',
  'ぱ','ぴ','ぷ','ぺ','ぽ'
];

// Gojuon 全体のボリューム（0〜1）
let gojuonVolume = 1.0;

// デフォルト音声ファイルのパス
// 例: ./audio/gojuon/あ.mp3, ./audio/gojuon/い.mp3, ...
// 必要ならパスは自分の構成に合わせて変えてね
const GOJUON_AUDIO_BASE = "./audio/gojuon/";

// 各文字に対応する Audio 配列
// 最初に「デフォルト音声」を全部入れておく
const audioList = gojuonCharacters.map(ch => {
  const audio = new Audio(`${GOJUON_AUDIO_BASE}${ch}.mp3`);
  audio.volume = gojuonVolume;
  return audio;
});

// HTML 要素
const gojuonFileInput = document.getElementById("gojuon-file-input");
const gojuonVolSlider = document.getElementById("gojuon-volume");
const gojuonVolValue  = document.getElementById("gojuon-volume-value");

// ====== デフォルト音声があるボタンをハイライト ======
gojuonCharacters.forEach(char => {
  document
    .querySelectorAll(`.kana-key[data-hira="${char}"]`)
    .forEach(btn => btn.classList.add("has-audio"));
});

// ====== ファイル入力：ユーザーが上書きする用 ======
if (gojuonFileInput) {
  gojuonFileInput.addEventListener("change", (event) => {
    const files = Array.from(event.target.files || []);
    let assignedCount = 0;

    files.forEach(file => {
      const fileNameNoExt = file.name.replace(/\..+$/, ""); // 拡張子カット

      // ファイル名に「あ」「か」などが含まれているかチェック
      const idx = gojuonCharacters.findIndex(ch =>
        fileNameNoExt.includes(ch) || ch.includes(fileNameNoExt)
      );

      if (idx !== -1) {
        assignAudioToChar(file, idx);  // ここでデフォルト音声を「上書き」
        assignedCount++;
      }
    });

    if (assignedCount > 0) {
      alert(`音声ファイルを ${assignedCount} 個、既存のパッドに上書きしました！`);
    } else {
      alert(`割り当てできませんでした。\nファイル名に「五十音の文字」を含めてください（例: "あ.mp3", "か_1.wav"）`);
    }
  });
}

function assignAudioToChar(file, index) {
  const url = URL.createObjectURL(file);
  const audio = new Audio(url);
  audio.volume = gojuonVolume;
  audioList[index] = audio;  // デフォルト音声をここで差し替え

  // 対応するボタンをハイライト（既に has-audio ついててもOK）
  const char = gojuonCharacters[index];
  document
    .querySelectorAll(`.kana-key[data-hira="${char}"]`)
    .forEach(btn => btn.classList.add("has-audio"));
}

// ====== Gojuon volume slider ======
if (gojuonVolSlider) {
  const applyGojuonVol = () => {
    gojuonVolume = parseFloat(gojuonVolSlider.value || "1");
    if (gojuonVolValue) {
      gojuonVolValue.textContent = `${Math.round(gojuonVolume * 100)}%`;
    }
    audioList.forEach(a => {
      if (a) a.volume = gojuonVolume;
    });
  };
  gojuonVolSlider.addEventListener("input", applyGojuonVol);
  applyGojuonVol();
}

// ====== ボタンクリックで再生 ======
document.querySelectorAll(".kana-key").forEach(btn => {
  const hira = btn.dataset.hira;
  const idx = gojuonCharacters.indexOf(hira);

  if (idx === -1) return;

  btn.addEventListener("click", () => {
    const audio = audioList[idx];
    if (!audio) {
      // （ほぼ起こらない想定）音がない場合 → 赤くチカッと
      btn.classList.add("no-audio-flash");
      setTimeout(() => btn.classList.remove("no-audio-flash"), 200);
      return;
    }

    try {
      if (typeof ensureAudioGraph === "function" && typeof wireAudioElement === "function") {
        ensureAudioGraph();
        wireAudioElement(audio);
      }
    } catch (e) {
      console.warn("wireAudioElement failed:", e);
    }

    audio.currentTime = 0;
    audio.volume = gojuonVolume;
    audio.play().catch(() => {});
  });
});



// =============================
//  🎮 Melody Game Logic (PAGE 2)
// =============================

// ===== Import Firebase helpers  =====
import { onAuthStateChangedHandler, saveScore } from './backend-integration.js';

// Use a unique name to avoid conflicts
let mgCurrentUser = null;

// Watch auth state 
onAuthStateChangedHandler(user => {
  mgCurrentUser = user || null;
  console.log('Auth state changed. mgCurrentUser = ', mgCurrentUser ? mgCurrentUser.uid : 'none');
});

// ===== Melody Game logic =====

// The melody game shares the main audioCtx
const mgAudioCtx = audioCtx;

// DOM elements
const gamePads        = Array.from(document.querySelectorAll('.game-pad'));
const gameStartBtn    = document.getElementById('game-start');
const gameResetBtn    = document.getElementById('game-reset');
const gameSpeedEl     = document.getElementById('game-speed');
const gameSpeedLbl    = document.getElementById('game-speed-label');
const gameStrictEl    = document.getElementById('game-strict');

const gameLevelEl     = document.getElementById('game-level');
const gameScoreEl     = document.getElementById('game-score');
const gameLivesEl     = document.getElementById('game-lives');
const gameStatusEl    = document.getElementById('game-status');

const gameResultEl    = document.getElementById('game-result');
const gameHighScoreEl = document.getElementById('game-highscore');
const gameComboEl     = document.getElementById('game-combo');
const gameMaxComboEl  = document.getElementById('game-max-combo');

const gamePauseBtn    = document.getElementById('game-pause');
const gameResumeBtn   = document.getElementById('game-resume');
const gameDifficultyEl= document.getElementById('game-difficulty');
const gameSoundModeEl = document.getElementById('game-sound-mode');

const gameContainer   = document.getElementById('game-container');

// Game state
let sequence = [];
let userIndex = 0;
let level = 0;
let score = 0;
let lives = 3;
let isPlayingSequence = false;
let isUserTurn = false;
let isPaused = false;

// Combo / high score
let comboCount = 0;
let maxCombo   = 0;
let bestScore  = 0;
let bestLevel  = 0;

// ===== UI update helpers =====
function updateSpeedLabel() {
  if (!gameSpeedEl || !gameSpeedLbl) return;
  const v = parseFloat(gameSpeedEl.value || '1');
  if (v < 0.7) {
    gameSpeedLbl.textContent = '早い';
  } else if (v > 1.1) {
    gameSpeedLbl.textContent = '遅い';
  } else {
    gameSpeedLbl.textContent = '普通';
  }
}

function updateComboDisplay() {
  if (gameComboEl) {
    gameComboEl.textContent = `コンボ: ${comboCount}`;
  }
  if (gameMaxComboEl) {
    gameMaxComboEl.textContent = `コンボセット: ${maxCombo}`;
  }
}

function updateHighScoreDisplay() {
  if (gameHighScoreEl) {
    gameHighScoreEl.textContent = `ベストスコア: ${bestScore} (ベストレベル ${bestLevel})`;
  }
}

if (gameSpeedEl) {
  updateSpeedLabel();
  gameSpeedEl.addEventListener('input', updateSpeedLabel);
}

// ===== Difficulty handling =====
function applyDifficultySettings() {
  if (!gameDifficultyEl) return;

  const mode = gameDifficultyEl.value || 'normal';

  // Speed, lives, strict mode
  if (mode === 'easy') {
    if (gameSpeedEl) gameSpeedEl.value = '0.8';
    lives = 5;
    if (gameLivesEl) gameLivesEl.textContent = String(lives);
    if (gameStrictEl) gameStrictEl.checked = false;
  } else if (mode === 'hard') {
    if (gameSpeedEl) gameSpeedEl.value = '1.3';
    lives = 1;
    if (gameLivesEl) gameLivesEl.textContent = String(lives);
    if (gameStrictEl) gameStrictEl.checked = true;
  } else {
    // normal
    if (gameSpeedEl) gameSpeedEl.value = '1.0';
    lives = 3;
    if (gameLivesEl) gameLivesEl.textContent = String(lives);
    if (gameStrictEl) gameStrictEl.checked = false;
  }

  updateSpeedLabel();
}

if (gameDifficultyEl) {
  gameDifficultyEl.addEventListener('change', () => {
    applyDifficultySettings();
  });
}

// ===== Sound for pads (sequence + user input) =====
function playGamePadTone(freq, lengthSec = 0.25) {
  if (!mgAudioCtx) return;

  const osc  = mgAudioCtx.createOscillator();
  const gain = mgAudioCtx.createGain();

  // Sound mode
  let mode = gameSoundModeEl ? gameSoundModeEl.value : 'chip';
  switch (mode) {
    case 'soft':
      osc.type = 'sine';
      break;
    case 'bright':
      osc.type = 'sawtooth';
      break;
    case 'chip':
    default:
      osc.type = 'square';
      break;
  }

  osc.frequency.value = freq;

  const now     = mgAudioCtx.currentTime;
  const attack  = 0.01;
  const release = lengthSec;

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.35, now + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + release);

  osc.connect(gain);
  gain.connect(mgAudioCtx.destination);

  osc.start(now);
  osc.stop(now + release + 0.05);
}

// Flash a pad and play tone 
function flashPad(padIndex, speedFactor = 1) {
  return new Promise(resolve => {
    const pad = gamePads[padIndex];
    if (!pad) return resolve();

    const freq = parseFloat(pad.dataset.note || '440');
    const activeDurationSec = 0.25 / speedFactor;
    const totalDurationSec  = 0.35 / speedFactor;

    pad.classList.add('game-pad-active');
    playGamePadTone(freq, activeDurationSec);

    setTimeout(() => {
      pad.classList.remove('game-pad-active');
      setTimeout(resolve, (totalDurationSec - activeDurationSec) * 1000);
    }, activeDurationSec * 1000);
  });
}

// Play the whole sequence
async function playSequence() {
  if (!gameStatusEl || !gameSpeedEl) return;
  isPlayingSequence = true;
  isUserTurn = false;
  gameStatusEl.textContent = '見て覚えよう…';

  const speedFactor = parseFloat(gameSpeedEl.value || '1');

  for (let i = 0; i < sequence.length; i++) {
    if (isPaused) break; // simple safety: don't continue if paused
    const idx = sequence[i];
    await flashPad(idx, speedFactor);
  }

  if (!isPaused) {
    isPlayingSequence = false;
    isUserTurn = true;
    userIndex = 0;
    gameStatusEl.textContent = 'あなたの順番。';
  } else {
    isPlayingSequence = false;
  }
}

// Start the next level
function nextLevel() {
  if (!gameLevelEl || !gameScoreEl) return;
  level += 1;
  gameLevelEl.textContent = String(level);

  // Add a random pad to the sequence
  const nextPad = Math.floor(Math.random() * gamePads.length);
  sequence.push(nextPad);

  // Increase combo because cleared the previous level
  comboCount += 1;
  if (comboCount > maxCombo) maxCombo = comboCount;
  updateComboDisplay();

  // Score: base + combo bonus
  const baseScore = 10;
  const comboBonus = comboCount * 2;
  score += baseScore + comboBonus;
  gameScoreEl.textContent = String(score);

  // Level-up animation hook
  if (gameContainer) {
    gameContainer.classList.add('level-up-flash');
    setTimeout(() => gameContainer.classList.remove('level-up-flash'), 400);
  }

  playSequence();
}

// Reset game state
function resetGame(full = true) {
  if (full) {
    level = 0;
    score = 0;
    sequence = [];
    lives = 3;
    comboCount = 0;
    maxCombo = 0;
    if (gameLevelEl) gameLevelEl.textContent = '0';
    if (gameScoreEl) gameScoreEl.textContent = '0';
    if (gameLivesEl) gameLivesEl.textContent = '3';
    if (gameResultEl) gameResultEl.textContent = '';
    updateComboDisplay();
  }
  isPlayingSequence = false;
  isUserTurn = false;
  isPaused = false;
  userIndex = 0;

  gamePads.forEach(p => {
    p.classList.remove('game-pad-active');
  });
  if (gameStatusEl) {
    gameStatusEl.textContent = 'スタートを押して始めよう！';
  }
}

// ===== Game Over handler (shows result + optionally saves score) =====
function handleGameOver(messageText) {
  if (gameStatusEl) {
    gameStatusEl.textContent = messageText;
  }

  const finalScore = score;
  const finalLevel = level;
  const livesLeft  = lives;
  const finalMaxCombo = maxCombo;

  console.log('ゲーム終了。 結果:', finalScore, 'レベル:', finalLevel, 'ミス残り:', livesLeft, 'コンボセット:', finalMaxCombo);

  // Update high score (local, in this browser session)
  if (finalScore > bestScore) {
    bestScore = finalScore;
    bestLevel = finalLevel;
    updateHighScoreDisplay();
  }

  // Show result on the page
  if (gameResultEl) {
    let resultMsg = `結果: ${finalScore} (レベル ${finalLevel} / ミス残り: ${livesLeft} / コンボセット: ${finalMaxCombo})`;

    if (mgCurrentUser) {
      resultMsg += '  👉 ログインしたので、結果を登録しました。';
    } else {
      resultMsg += '  👉 結果登録のため、ログイン必須！';
    }

    gameResultEl.textContent = resultMsg;
  }

  // If not logged in, just show result, do not save
  if (!mgCurrentUser) {
    return;
  }

  // If logged in, save score to Firestore
  if (typeof saveScore === 'function') {
    saveScore(mgCurrentUser.uid, {
      score: finalScore,
      level: finalLevel,
      livesLeft: livesLeft,
      maxCombo: finalMaxCombo
    })
      .then(() => {
        console.log('結果登録済み！');
      })
      .catch(err => {
        console.error('登録エラー', err);
      });
  }
}

// ===== Pause / Resume =====
function pauseGame() {
  if (!isUserTurn) {
    // Only pause during the user's turn 
    return;
  }
  isPaused = true;
  isUserTurn = false;
  if (gameStatusEl) {
    gameStatusEl.textContent = 'ストップ';
  }
}

function resumeGame() {
  if (!isPaused) return;
  isPaused = false;
  isUserTurn = true;
  if (gameStatusEl) {
    gameStatusEl.textContent = '続ける。。。';
  }
}

if (gamePauseBtn) {
  gamePauseBtn.addEventListener('click', pauseGame);
}
if (gameResumeBtn) {
  gameResumeBtn.addEventListener('click', resumeGame);
}

// ===== Handle user pressing a pad =====
function handleUserPad(padIndex) {
  if (!isUserTurn || isPlayingSequence || sequence.length === 0 || isPaused) return;

  const expected = sequence[userIndex];
  const pad = gamePads[padIndex];
  if (!pad) return;

  // Small beep + highlight for user input
  pad.classList.add('game-pad-active');
  const freq = parseFloat(pad.dataset.note || '440');
  playGamePadTone(freq, 0.2);
  setTimeout(() => pad.classList.remove('game-pad-active'), 180);

  if (padIndex === expected) {
    userIndex += 1;

    // Completed the whole sequence correctly
    if (userIndex >= sequence.length) {
      isUserTurn = false;
      if (gameStatusEl) gameStatusEl.textContent = 'ナイス！次のレベルへ。。。';
      setTimeout(nextLevel, 700);
    }
  } else {
    // Mistake → reset combo
    comboCount = 0;
    updateComboDisplay();

    // Strict mode: immediate game over
    if (gameStrictEl && gameStrictEl.checked) {
      isUserTurn = false;
      handleGameOver('ゲーム終了！リッセトを押してください。');
    } else {
      lives -= 1;
      if (lives < 0) lives = 0;
      if (gameLivesEl) gameLivesEl.textContent = String(lives);

      if (lives <= 0) {
        isUserTurn = false;
        handleGameOver('ミス残りなし。 ゲーム終了！リッセトを押してください。');
      } else {
        if (gameStatusEl) {
          gameStatusEl.textContent = `ミス! ミス残り: ${lives}. レベルをまた挑戦。`;
        }
        isUserTurn = false;
        setTimeout(playSequence, 800);
      }
    }
  }
}

// ===== Buttons =====
if (gameStartBtn) {
  gameStartBtn.addEventListener('click', () => {
    if (sequence.length === 0) {
      resetGame(true);
      applyDifficultySettings();
    }
    if (gameStatusEl) gameStatusEl.textContent = 'スタート。';
    nextLevel();
  });
}

if (gameResetBtn) {
  gameResetBtn.addEventListener('click', () => {
    resetGame(true);
    applyDifficultySettings();
  });
}

// Pad clicks
gamePads.forEach((pad, index) => {
  pad.addEventListener('click', () => handleUserPad(index));
});

// Keyboard controls (I / O / K / L)
window.addEventListener('keydown', (e) => {
  if (isTypingInTextField()) return;
  const pageGame = document.getElementById('page-game');
  const isGameActive = pageGame && pageGame.classList.contains('mode-page-active');
  if (!isGameActive) return;          // Do nothing if game page is not active
  if (!isUserTurn || isPlayingSequence || sequence.length === 0 || isPaused) return;

  const key = e.key.toLowerCase();
  if (key === '-') { e.preventDefault(); handleUserPad(0); }
  if (key === '^') { e.preventDefault(); handleUserPad(1); }
  if (key === '@') { e.preventDefault(); handleUserPad(2); }
  if (key === '[') { e.preventDefault(); handleUserPad(3); }
});

// ----------------- Theme -------------------------
const THEME_KEY = "app-theme";

function applyTheme(theme) {
  document.body.classList.remove("theme-cyber");

  if (theme === "cyber") {
    document.body.classList.add("theme-cyber");
  }

  localStorage.setItem(THEME_KEY, theme);

  const btn = document.getElementById("theme-toggle");
  if (btn) {
    btn.textContent = theme === "cyber" ? "⚡ サイバー" : "🌿 テーマ";
  }
}

function toggleTheme() {
  const isCyber = document.body.classList.contains("theme-cyber");
  applyTheme(isCyber ? "default" : "cyber");
}

// Restore theme on load
const savedTheme = localStorage.getItem(THEME_KEY) || "default";
applyTheme(savedTheme);

// Sync across pages / tabs
window.addEventListener("storage", (event) => {
  if (event.key === THEME_KEY) {
    applyTheme(event.newValue || "default");
  }
});

// Button click
const themeToggle = document.getElementById("theme-toggle");
if (themeToggle) {
  themeToggle.addEventListener("click", toggleTheme);
}



function isTypingInTextField() {
  const el = document.activeElement;
  if (!el) return false;
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.isContentEditable
  );
}
