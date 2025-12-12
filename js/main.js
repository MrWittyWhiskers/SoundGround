import * as backend from './backend-integration.js';

import { applyDistortion } from './effects/distortion.js';
import { applyBitCrusher } from './effects/bitcrusher.js';
import { applyLoFi } from './effects/lofi.js';
import { applyFilter } from './effects/filter.js';
import { applySlicer } from './effects/slicer.js';
import { applyUnyouNyo } from './effects/unyounyo.js';
import { applyFlanger } from './effects/flanger.js';
import { applyDelay } from './effects/delay.js';
import { applyReverb } from './effects/reverb.js'; // リバーブも読み込む

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

const freqs = {
  '低いド': 130.81, '低いド#': 138.59, '低いレ': 146.83, '低いレ#': 155.56, '低いミ': 164.81, '低いファ': 174.61, '低いファ#': 185.00, '低いソ': 196.00, '低いソ#': 207.65, '低いラ': 220.00, '低いラ#': 233.08, '低いシ': 246.94,
  'ド': 261.63, 'ド#': 277.18, 'レ': 293.66, 'レ#': 311.13, 'ミ': 329.63, 'ファ': 349.23, 'ファ#': 369.99, 'ソ': 392.00, 'ソ#': 415.30, 'ラ': 440.00, 'ラ#': 466.16, 'シ': 493.88,
  '高いド': 523.25, '高いド#': 554.37, '高いレ': 587.33, '高いレ#': 622.25, '高いミ': 659.26
};

const noteOrder = Object.keys(freqs);
let bpm = 120;
let sampleBuffers = new Array(9).fill(null);
let samplePadNames = new Array(9).fill(""); 
let padStates = Array(9).fill(null).map(() => ({
  buffer: null,
  url: null,     // Firebase StorageのURL
  name: "",      // サンプル名
  inverted: false // 位相反転の状態
}));
let activeOscillators = {}; 
let isPentatonicMode = false;
let currentUser = null; // 現在のログインユーザー
let unsubscribePresets = null; // プリセット購読解除用の関数

// =======================================================
//               UI要素の取得 (追加)
// =======================================================
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userInfo = document.getElementById('user-info');
const userName = document.getElementById('user-name');
const mainContent = document.getElementById('main-content');
const savePresetBtn = document.getElementById('save-preset-btn');
const presetNameInput = document.getElementById('preset-name');
const presetsList = document.getElementById('presets-list');

const presetLoginPrompt = document.getElementById('preset-login-prompt');
const presetControls = document.getElementById('preset-controls');

const recordBtn = document.getElementById('record-btn');
const stopBtn = document.getElementById('stop-btn');
const recordingControls = document.getElementById('recording-controls');
const recordingPlayer = document.getElementById('recording-player');
const downloadBtn = document.getElementById('download-btn');
const recordingNameInput = document.getElementById('recording-name');
const saveRecordingBtn = document.getElementById('save-recording-btn');
const recordingsList = document.getElementById('recordings-list');

// 録音機能で使う変数
let mediaRecorder;
let audioChunks = [];
let recordedBlob = null;
let unsubscribeRecordings = null;

// =======================================================
//               認証関連のUI更新
// =======================================================
function showLoggedInUI(user) {
  userInfo.style.display = 'flex';
  loginBtn.style.display = 'none';
  userName.textContent = user.displayName;

  // ▼▼▼ ログイン時に表示するものを制御 ▼▼▼
  presetLoginPrompt.style.display = 'none';  // 「ログインしてください」を隠す
  presetControls.style.display = 'block'; // 保存コントロールを表示
  presetsList.style.display = 'block';    // プリセットリストを表示
  
  if (unsubscribeRecordings) unsubscribeRecordings();
  unsubscribeRecordings = backend.subscribeToRecordings(user.uid, displayRecordings);
  document.getElementById('recordings-list-container').style.display = 'block';

  // ユーザーのプリセットを購読開始
  if (unsubscribePresets) unsubscribePresets();
  unsubscribePresets = backend.subscribeToPresets(user.uid, displayPresets);
}

// 録音リストを表示する関数
function displayRecordings(recordings) {
  recordingsList.innerHTML = '';
  recordings.forEach(rec => {
    const li = document.createElement('li');
    const nameSpan = document.createElement('span');
    nameSpan.textContent = rec.id;
    li.appendChild(nameSpan);
    const controlsDiv = document.createElement('div');
    const playBtn = document.createElement('button');
    playBtn.textContent = '再生';
    playBtn.onclick = () => { new Audio(rec.url).play(); };
    controlsDiv.appendChild(playBtn);
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '削除';
    deleteBtn.onclick = () => {
      if (confirm(`録音「${rec.id}」を削除しますか？`)) {
        backend.deleteRecording(currentUser.uid, rec.id);
      }
    };
    controlsDiv.appendChild(deleteBtn);
    li.appendChild(controlsDiv);
    recordingsList.appendChild(li);
  });
}

function showLoggedOutUI() {
  // 1. ユーザー情報を隠し、ログインボタンを表示
  userInfo.style.display = 'none';
  loginBtn.style.display = 'block';
  // 2. 「ログインしてください」のメッセージを表示
  presetLoginPrompt.style.display = 'block';
  
  // 3. プリセットの保存ボタンと入力欄を非表示にする
  presetControls.style.display = 'none';
  
  // 4. プリセットリストをクリアして非表示にする
  if (unsubscribePresets) unsubscribePresets();
  presetsList.innerHTML = '';
  presetsList.style.display = 'none';

  // 5. パッドの状態をリセットして、音をクリアする
  padStates = Array(9).fill(null).map(() => ({
    buffer: null,
    url: null,
    name: "",
    inverted: false
  }));
  updatePadsUI(); // UIを更新して見た目にも反映させる
}

// =======================================================
//               プリセット関連の処理
// =======================================================
/** パッドの現在の状態をオブジェクトとして収集する */
function gatherPadData() {
  return padStates.map((state, i) => ({
    url: state.url,
    name: state.name,
    inverted: document.getElementById(`pad-invert-${i}`).checked
  }));
}

/** プリセットデータを適用してUIと音源を更新する */
async function applyPreset(preset) {
  if (!preset || !preset.pads) return;

  // UIをリセット
  padStates.forEach(s => { s.buffer = null; s.url = null; s.name = ""; s.inverted = false; });

  // 新しいプリセットデータをロード
  const loadPromises = preset.pads.map(async (padData, i) => {
    if (padData && padData.url) {
      try {
        const response = await fetch(padData.url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        padStates[i] = {
          buffer: audioBuffer,
          url: padData.url,
          name: padData.name || "",
          inverted: padData.inverted || false
        };
        // UIにも反映
        document.getElementById(`pad-invert-${i}`).checked = padData.inverted || false;
      } catch (error) {
        console.error(`プリセット音源の読み込みに失敗: ${padData.url}`, error);
        padStates[i] = { buffer: null, url: null, name: "(ロード失敗)", inverted: false };
      }
    }
  });

  await Promise.all(loadPromises);
  updatePadsUI(); // すべてのロードが終わったらUIを更新
  alert(`プリセット「${preset.id}」をロードしました。`);
}

/** プリセットリストをUIに表示する */
function displayPresets(presets) {
  presetsList.innerHTML = '';
  presets.forEach(preset => {
    const li = document.createElement('li');
    li.textContent = preset.id;
    li.dataset.presetId = preset.id;
    
    const deleteBtn = document.createElement('span');
    deleteBtn.textContent = '✖';
    deleteBtn.className = 'delete-preset';
    deleteBtn.onclick = (e) => {
      e.stopPropagation(); // liへのクリックイベント伝播を防ぐ
      if (confirm(`プリセット「${preset.id}」を削除しますか？`)) {
        backend.deletePreset(currentUser.uid, preset.id);
      }
    };

    li.appendChild(deleteBtn);
    li.addEventListener('click', () => applyPreset(preset));
    presetsList.appendChild(li);
  });
}

let currentKey = 'ド';
const chromaticScale = ['ド', 'ド#', 'レ', 'レ#', 'ミ', 'ファ', 'ファ#', 'ソ', 'ソ#', 'ラ', 'ラ#', 'シ'];
let activePentatonicScale = [];
const masterGain = audioCtx.createGain();
masterGain.connect(audioCtx.destination);

// --- 録音のセットアップ ---
const streamDestination = audioCtx.createMediaStreamDestination();
masterGain.connect(streamDestination);

try {
  mediaRecorder = new MediaRecorder(streamDestination.stream, { mimeType: 'audio/webm' });
} catch(e) {
  console.warn("WebMはサポートされていません。audio/oggを試します。");
  mediaRecorder = new MediaRecorder(streamDestination.stream, { mimeType: 'audio/ogg; codecs=opus' });
}

mediaRecorder.ondataavailable = event => {
  audioChunks.push(event.data);
};

mediaRecorder.onstop = () => {
  recordedBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
  const audioUrl = URL.createObjectURL(recordedBlob);
  recordingPlayer.src = audioUrl;

  recordingControls.style.display = 'block';
  if (!currentUser) {
    saveRecordingBtn.disabled = true;
    recordingNameInput.disabled = true;
    recordingNameInput.placeholder = "保存にはログインが必要です";
  } else {
    saveRecordingBtn.disabled = false;
    recordingNameInput.disabled = false;
    recordingNameInput.placeholder = "録音名を入力";
  }
};

let currentPitchShift = 0; // 現在のピッチシフト量（セミトーン単位）
const semitonesToPlaybackRate = (semitones) => Math.pow(2, semitones / 12);
const keyToNoteMap = {
  'a': 'ド', 'w': 'ド#', 's': 'レ', 'e': 'レ#', 'd': 'ミ', 'f': 'ファ', 't': 'ファ#', 'g': 'ソ', 'y': 'ソ#', 'h': 'ラ', 'u': 'ラ#', 'j': 'シ',
  'k': '高いド', 'o': '高いド#', 'l': '高いレ', 'p': '高いレ#', ';': '高いミ'
};
const noteToKeyMap = Object.fromEntries(Object.entries(keyToNoteMap).map(([key, note]) => [note, key]));
const keyboard = document.getElementById("keyboard");
const whiteKeyWidth = 45;
let whiteKeyCount = 0;

noteOrder.forEach(note => {
  const key = document.createElement("div");
  const isBlack = note.includes('#');
  key.className = isBlack ? 'key black' : 'key white';
  const keyMapping = noteToKeyMap[note] || '';
  key.innerHTML = `<span>${note.replace('低い', '低').replace('高い', '高').replace('#', '♯')}</span><span class="key-mapping">${keyMapping.toUpperCase()}</span>`;
  key.dataset.note = note;
  key.addEventListener("mousedown", () => startTone(freqs[note]));
  key.addEventListener("mouseup", () => stopTone(freqs[note]));
  key.addEventListener("mouseleave", () => stopTone(freqs[note]));
  if (isBlack) { key.style.left = `${((whiteKeyCount - 1) * whiteKeyWidth) + (whiteKeyWidth / 2)}px`; }
  else { whiteKeyCount++; }
  keyboard.appendChild(key);
});

const padsContainer = document.getElementById('pads-container');
for (let i = 0; i < 9; i++) {
  // 1. ラッパーDIVを作成
  const wrapper = document.createElement('div');
  wrapper.classList.add('pad-wrapper');

  // 2. 名前表示用の SPAN を作成
  const padName = document.createElement('span');
  padName.classList.add('pad-name');
  padName.id = `pad-name-${i}`;
  padName.textContent = '...'; // 初期テキスト

  // 名前クリックで編集
  padName.addEventListener('click', () => {
    if (!sampleBuffers[i]) return; // ロードされてない場合は編集不可
    const currentName = samplePadNames[i];
    const newName = prompt(`パッド ${i + 1} の名前を変更:`, currentName);
    
    if (newName !== null) { // キャンセルでなければ
      samplePadNames[i] = newName;
      padName.textContent = newName || `(パッド ${i + 1})`; // 空欄対策
    }
  });
  wrapper.appendChild(padName); // ラッパーに名前を追加

  // 3. パッド本体 (Button) を作成
  const pad = document.createElement('button');
  pad.classList.add('sample-pad');
  pad.textContent = i + 1;
  pad.dataset.index = i;
  pad.addEventListener('click', () => { playUploaded(i); });
  wrapper.appendChild(pad); // ラッパーにパッドを追加

  // 4. 位相反転チェックボックスを作成
  const label = document.createElement('label');
  label.classList.add('pad-invert-toggle');
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = `pad-invert-${i}`;
  checkbox.dataset.index = i;
  label.appendChild(checkbox);
  label.appendChild(document.createTextNode(' 位相反転 (Ø)'));
  wrapper.appendChild(label); // ラッパーに追加

  padsContainer.appendChild(wrapper); // ラッパーをコンテナに追加
}

function updatePadsUI() {
  const loadedCount = padStates.filter(s => s.buffer !== null).length;
  document.getElementById('pad-counter').textContent = `${loadedCount}/9`;

  document.querySelectorAll('.sample-pad').forEach((pad, i) => {
    const padNameEl = document.getElementById(`pad-name-${i}`);
    const state = padStates[i];

    if (state.buffer) {
      pad.classList.add('loaded');
      padNameEl.classList.add('editable');
      padNameEl.textContent = state.name || `(パッド ${i + 1})`;
    } else {
      pad.classList.remove('loaded');
      padNameEl.classList.remove('editable');
      padNameEl.textContent = '...';
      if (state) state.name = "";
    }
  });
}

export function getNoteDurationInSeconds(noteString) {
  let isDotted = false, noteValue = noteString;
  if (typeof noteValue === 'string' && noteValue.endsWith('d')) {
    isDotted = true;
    noteValue = noteValue.slice(0, -1);
  }
  noteValue = parseFloat(noteValue);
  if (isNaN(noteValue) || bpm === 0) return 0;
  let duration = (60 / bpm) * (4 / noteValue);
  if (isDotted) duration *= 1.5;
  return duration;
}
export function getNoteFrequencyInHz(noteValue) {
  const duration = getNoteDurationInSeconds(noteValue);
  return duration > 0 ? 1 / duration : 0;
}

function calculatePentatonicScale() {
  const rootIndex = chromaticScale.indexOf(currentKey);
  if (rootIndex === -1) { activePentatonicScale = [...chromaticScale]; return; }
  const intervals = [0, 2, 4, 7, 9]; // メジャーペンタトニック
  activePentatonicScale = intervals.map(interval => chromaticScale[(rootIndex + interval) % 12]);
}

// Pentatonic check修正
function isNoteInScale(noteName) {
  if (!isPentatonicMode) return true;
  if (!noteName) return false;
  
  // '低い' と '高い' だけを削除し、'ド#' などは残す
  const baseNote = noteName.replace(/低い|高い/g, ''); 
  return activePentatonicScale.includes(baseNote);
}

function updateKeyboardForPentatonic() {
  document.querySelectorAll('#keyboard .key').forEach(key => {
    if (isNoteInScale(key.dataset.note)) { key.classList.remove('disabled'); } 
    else { key.classList.add('disabled'); }
  });
}

function buildEffectChain(startNode, externalNodes = {}) {
  let lastNode = startNode;
  let cleanupFunctions = [];
  let effectCount = 0;
  document.querySelectorAll('.control-panel input[type="checkbox"]').forEach(cb => { 
    if (cb.id !== 'toggle-pentatonic' && cb.checked) effectCount++; 
  });
  if (effectCount > 0) {
    const makeupGain = audioCtx.createGain();
    makeupGain.gain.value = 1 + (effectCount * 0.1); 
    lastNode.connect(makeupGain);
    lastNode = makeupGain;
  }
  
  if (document.getElementById("toggle-distortion").checked) {
    const res = applyDistortion(audioCtx, lastNode);
    lastNode = res.outputNode; if (res.cleanup) cleanupFunctions.push(res.cleanup);
  }
  if (document.getElementById("toggle-bitcrusher").checked) { 
    const res = applyBitCrusher(audioCtx, lastNode);
    lastNode = res.outputNode; if (res.cleanup) cleanupFunctions.push(res.cleanup);
  }
  if (document.getElementById("toggle-lofi").checked) { 
    const res = applyLoFi(audioCtx, lastNode);
    lastNode = res.outputNode; if (res.cleanup) cleanupFunctions.push(res.cleanup);
  }
  
  let filterNodeForLFO = null;
  if (document.getElementById("toggle-filter").checked) { 
    const res = applyFilter(audioCtx, lastNode);
    filterNodeForLFO = res.outputNode; 
    lastNode = res.outputNode;
    if (res.cleanup) cleanupFunctions.push(res.cleanup);
  }
  if (externalNodes.lfoFilterGain && filterNodeForLFO) {
    externalNodes.lfoFilterGain.connect(filterNodeForLFO.frequency);
  }

  if (document.getElementById("toggle-slicer").checked) {
    const res = applySlicer(audioCtx, lastNode, { getNoteDurationInSeconds });
    lastNode = res.outputNode; if (res.cleanup) cleanupFunctions.push(res.cleanup);
  }
  if (document.getElementById("toggle-unyounyo").checked) { 
    const res = applyUnyouNyo(audioCtx, lastNode);
    lastNode = res.outputNode; if (res.cleanup) cleanupFunctions.push(res.cleanup);
  }
  if (document.getElementById("toggle-flanger").checked) { 
    const res = applyFlanger(audioCtx, lastNode, { getNoteFrequencyInHz });
    lastNode = res.outputNode; if (res.cleanup) cleanupFunctions.push(res.cleanup);
  }
  if (document.getElementById("toggle-delay").checked) { 
    const res = applyDelay(audioCtx, lastNode, { getNoteDurationInSeconds });
    lastNode = res.outputNode; if (res.cleanup) cleanupFunctions.push(res.cleanup);
  }
  if (document.getElementById("toggle-reverb").checked) { 
    const res = applyReverb(audioCtx, lastNode);
    lastNode = res.outputNode; if (res.cleanup) cleanupFunctions.push(res.cleanup);
  }
  lastNode.connect(masterGain);
  return { cleanupFunctions };
}

function startTone(freq) {
  if (audioCtx.state === "suspended") audioCtx.resume();
  if (activeOscillators[freq]) return;
  const noteName = Object.keys(freqs).find(key => freqs[key] === freq);
  if (!isNoteInScale(noteName)) return;

  const osc = audioCtx.createOscillator();
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  const selectedWave = document.getElementById('osc-waveform').value;
  
  let pwm_lfo = null;
  if (selectedWave === 'square') {
    osc.type = 'square'; 
    const pwmDepth = parseFloat(document.getElementById('osc-pwm').value);
    if (pwmDepth > 0) {
      pwm_lfo = audioCtx.createOscillator();
      const pwm_gain = audioCtx.createGain();
      pwm_lfo.frequency.value = 6;
      pwm_gain.gain.value = pwmDepth * 10;
      pwm_lfo.connect(pwm_gain);
      pwm_gain.connect(osc.frequency);
      pwm_lfo.start();
    }
  } else {
    osc.type = selectedWave;
  }

  const ampEnv = audioCtx.createGain();
  const now = audioCtx.currentTime;
  const attackTime = parseFloat(document.getElementById('env-attack').value);
  const decayTime = parseFloat(document.getElementById('env-decay').value);
  const sustainLevel = parseFloat(document.getElementById('env-sustain').value);
  ampEnv.gain.cancelScheduledValues(now);
  ampEnv.gain.setValueAtTime(0, now);
  ampEnv.gain.linearRampToValueAtTime(1, now + attackTime);
  ampEnv.gain.setTargetAtTime(sustainLevel, now + attackTime, decayTime + 0.01);

  const lfo = audioCtx.createOscillator();
  lfo.frequency.value = parseFloat(document.getElementById('lfo-rate').value);
  const lfoPitchGain = audioCtx.createGain();
  lfoPitchGain.gain.value = parseFloat(document.getElementById('lfo-pitch').value);
  const lfoFilterGain = audioCtx.createGain();
  lfoFilterGain.gain.value = parseFloat(document.getElementById('lfo-filter').value);
  const lfoAmpGain = audioCtx.createGain();
  lfoAmpGain.gain.value = parseFloat(document.getElementById('lfo-amp').value);
  lfo.connect(lfoPitchGain);
  lfo.connect(lfoFilterGain);
  lfo.connect(lfoAmpGain);
  lfoPitchGain.connect(osc.frequency);
  lfoAmpGain.connect(ampEnv.gain);
  lfo.start();
  
  osc.connect(ampEnv);
  const { cleanupFunctions } = buildEffectChain(ampEnv, { lfoFilterGain });
  osc.start();
  activeOscillators[freq] = { osc, ampEnv, pwm_lfo, lfo, cleanup: cleanupFunctions };
}

function stopTone(freq) {
  const noteToStop = activeOscillators[freq];
  if (noteToStop) {
    const now = audioCtx.currentTime;
    const releaseTime = parseFloat(document.getElementById('env-release').value);
    noteToStop.ampEnv.gain.cancelScheduledValues(now);
    noteToStop.ampEnv.gain.setTargetAtTime(0, now, releaseTime / 5);
    noteToStop.osc.stop(now + releaseTime);
    if (noteToStop.pwm_lfo) noteToStop.pwm_lfo.stop(now + releaseTime);
    noteToStop.lfo.stop(now + releaseTime);
    noteToStop.cleanup.forEach(func => func());
    setTimeout(() => { delete activeOscillators[freq]; }, releaseTime * 1000);
  }
}

let activeSampleSources = []; 

function playUploaded(index, loop = false) {
  const state = padStates[index];
  if (!state.buffer) return;
  if (audioCtx.state === "suspended") audioCtx.resume();

  const isPolyphonic = document.getElementById('toggle-pad-polyphony').checked;

  if (!isPolyphonic) {
    stopUploaded(index); 
  }

  const src = audioCtx.createBufferSource();
  src.buffer = state.buffer;
  src.playbackRate.value = semitonesToPlaybackRate(currentPitchShift);
  src.loop = loop;
  
  const mainGain = audioCtx.createGain();
  
  // 1. 位相反転チェックボックスの状態を取得
  const isInverted = document.getElementById(`pad-invert-${index}`).checked;

  // 2. スライダーの音量を取得し、10倍する
  const volume = (parseFloat(document.getElementById("uploadedVolume").value) || 1) * 10;

  // 3. 位相反転がオンなら音量を -1 倍する
  mainGain.gain.value = isInverted ? (volume * -1) : volume;

  src.connect(mainGain);
  const { cleanupFunctions } = buildEffectChain(mainGain);
  src.start();

  const sourceInfo = { index: index, source: src, cleanup: cleanupFunctions };
  activeSampleSources.push(sourceInfo);

  src.onended = () => {
    sourceInfo.cleanup.forEach(func => func());
    activeSampleSources = activeSampleSources.filter(s => s.source !== sourceInfo.source);
  };
}

function stopUploaded(indexToStop) {
  const sourcesToStop = activeSampleSources.filter(s => s.index === indexToStop);

  sourcesToStop.forEach(s => {
    try {
      s.source.stop();
      s.cleanup.forEach(func => func());
    } catch (e) {
      // 既に停止している場合などのエラーは無視
    }
  });

  activeSampleSources = activeSampleSources.filter(s => s.index !== indexToStop);
}

function updatePitchShift(newPitch) {
  currentPitchShift = newPitch;
  document.getElementById('pitch-shift-display').textContent = currentPitchShift;
  
  const newRate = semitonesToPlaybackRate(currentPitchShift);
  
  activeSampleSources.forEach(s => {
    if (s.source && s.source.playbackRate) {
      s.source.playbackRate.setValueAtTime(newRate, audioCtx.currentTime);
    }
  });
}

// ====== UI Event handlers ======
document.getElementById("bpm").addEventListener('input', e => { bpm = parseFloat(e.target.value) || 120; });
document.getElementById("master-volume").addEventListener('input', e => { masterGain.gain.value = parseFloat(e.target.value); });
document.getElementById('key-selector').addEventListener('change', e => {
  currentKey = e.target.value;
  if (isPentatonicMode) { calculatePentatonicScale(); updateKeyboardForPentatonic(); }
});
document.getElementById('toggle-pentatonic').addEventListener('change', e => {
  isPentatonicMode = e.target.checked;
  if (isPentatonicMode) { calculatePentatonicScale(); }
  updateKeyboardForPentatonic();
});

document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
  if (checkbox.id === 'toggle-pentatonic' || checkbox.id === 'toggle-pad-polyphony') return; 
  if (checkbox.id.startsWith('pad-invert-')) return; // パッドの位相反転トグルも除外
  
  checkbox.addEventListener('change', e => {
    const panelId = e.target.id.replace('toggle-', '') + '-controls';
    const panel = document.getElementById(panelId);
    if (panel) {
      panel.style.display = e.target.checked ? 'block' : 'none';
    }
  });
});

document.getElementById("upload").addEventListener("change", async (e) => {
  if (!currentUser) {
    alert("サンプルをアップロードするにはログインが必要です。");
    return;
  }
  const files = e.target.files;
  if (files.length === 0) return;

  for (const file of files) {
    let targetIndex = padStates.findIndex(s => s.buffer === null);
    if (targetIndex === -1) {
      const replaceSlot = prompt(`パッドは満員です (9/9)。\nどのパッド(1-9)の音源と入れ替えますか？`, '1');
      const index = parseInt(replaceSlot, 10) - 1;
      if (index >= 0 && index < 9) {
        targetIndex = index;
      } else {
        alert('無効な番号です。');
        break;
      }
    }

    try {
      // 1. Cloudinaryにアップロード (引数がfileのみになる)
      const { downloadURL, fileName } = await backend.uploadSample(file);

      // 2. アップロードしたファイルをデコード
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      // 3. padStatesを更新
      padStates[targetIndex] = {
        buffer: audioBuffer,
        url: downloadURL,
        name: fileName,
        inverted: false
      };

    } catch (error) {
      console.error("アップロードエラー:", error);
      alert(`ファイルのアップロードに失敗しました: ${file.name}`);
    }
  }
  updatePadsUI();
  e.target.value = '';
});

// ランダムノートボタン
const randBtn = document.getElementById("random");
let randomOsc = null;
randBtn.addEventListener("mousedown", () => {
  const randomNoteName = noteOrder[Math.floor(Math.random() * noteOrder.length)];
  startTone(freqs[randomNoteName]);
  randomOsc = { freq: freqs[randomNoteName] };
});
randBtn.addEventListener("mouseup", () => { if (randomOsc) stopTone(randomOsc.freq); });
randBtn.addEventListener("mouseleave", () => { if (randomOsc) stopTone(randomOsc.freq); });

// キーボード
const currentlyPressed = {};

window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  
  const key = e.key; 

  // --- ピッチシフト操作 ---
  if (key === 'ArrowUp') {
    e.preventDefault(); 
    updatePitchShift(currentPitchShift + 1);
    return;
  }
  if (key === 'ArrowDown') {
    e.preventDefault(); 
    updatePitchShift(currentPitchShift - 1);
    return;
  }
  // ------------------------
  
  const lowerKey = key.toLowerCase(); 

  // Melodyゲームページがアクティブのときは I/O/K/L をシンセ側では処理しない
  const pageGame = document.getElementById('page-game');
  const isGameActive = pageGame && pageGame.classList.contains('mode-page-active');
  if (isGameActive && ['i','o','k','l'].includes(lowerKey)) {
    return; // Melodyゲーム側の keydown が処理する
  }
  
  if (isFinite(lowerKey) && lowerKey >= '1' && lowerKey <= '9' && lowerKey.trim() !== '') {
    const padIndex = parseInt(lowerKey, 10) - 1;
    const pad = document.querySelector(`.sample-pad[data-index="${padIndex}"]`);
    if (pad && pad.classList.contains('loaded') && !currentlyPressed[lowerKey]) {
      currentlyPressed[lowerKey] = true;
      pad.classList.add('active');
      playUploaded(padIndex, false);
    }
    return;
  }
  
  const note = keyToNoteMap[lowerKey];
  if (note && isNoteInScale(note) && !currentlyPressed[lowerKey]) {
    currentlyPressed[lowerKey] = true;
    startTone(freqs[note]);
    const button = document.querySelector(`div[data-note="${note}"]`);
    if (button) button.classList.add('key-active');
  }
});

window.addEventListener('keyup', e => {
  const key = e.key.toLowerCase();
  if (isFinite(key) && key >= '1' && key <= '9' && key.trim() !== '') {
    const padIndex = parseInt(key, 10) - 1;
    const pad = document.querySelector(`.sample-pad[data-index="${padIndex}"]`);
    if (pad) {
      pad.classList.remove('active');
    }
    delete currentlyPressed[key];
    return;
  }
  const note = keyToNoteMap[key];
  if (note) {
    delete currentlyPressed[key];
    stopTone(freqs[note]);
    const button = document.querySelector(`div[data-note="${note}"]`);
    if (button) button.classList.remove('key-active');
  }
});

document.getElementById('reset-pitch').addEventListener('click', () => {
  updatePitchShift(0);
});

// =======================================================
//               認証・録音・プリセットボタン
// =======================================================
loginBtn.addEventListener('click', () => {
  backend.signInWithGoogle().catch(err => console.error(err));
});

logoutBtn.addEventListener('click', () => {
  backend.signOutUser().catch(err => console.error(err));
});

savePresetBtn.addEventListener('click', () => {
  const name = presetNameInput.value.trim();
  if (!currentUser) {
    alert("プリセットを保存するにはログインが必要です。");
    return;
  }
  if (!name) {
    alert("プリセット名を入力してください。");
    return;
  }
  const padData = gatherPadData();
  if (padData.every(p => !p.url)) {
    alert("保存するサンプルがありません。");
    return;
  }
  backend.savePreset(currentUser.uid, name, { pads: padData })
    .then(() => {
      alert(`プリセット「${name}」を保存しました。`);
      presetNameInput.value = '';
    })
    .catch(err => {
      console.error("プリセットの保存に失敗:", err);
      alert("プリセットの保存に失敗しました。");
    });
});

// --- 録音ボタンのイベント ---
recordBtn.addEventListener('click', () => {
  if (mediaRecorder.state === 'recording') return;
  audioChunks = [];
  recordedBlob = null;
  mediaRecorder.start();
  recordBtn.classList.add('recording');
  recordBtn.textContent = '🔴 録音中...';
  stopBtn.disabled = false;
  recordingControls.style.display = 'none';
});

stopBtn.addEventListener('click', () => {
  if (mediaRecorder.state !== 'recording') return;
  mediaRecorder.stop();
  recordBtn.classList.remove('recording');
  recordBtn.textContent = '🔴 録音';
  stopBtn.disabled = true;
});

downloadBtn.addEventListener('click', () => {
  if (!recordedBlob) return;
  const a = document.createElement('a');
  a.href = recordingPlayer.src;
  const extension = recordedBlob.type.includes('webm') ? 'webm' : 'ogg';
  a.download = `synth-recording-${Date.now()}.${extension}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
});

saveRecordingBtn.addEventListener('click', async () => {
  if (!recordedBlob || !currentUser) return;
  const name = recordingNameInput.value.trim();
  if (!name) {
    alert("録音名を入力してください。");
    return;
  }
  saveRecordingBtn.textContent = '保存中...';
  saveRecordingBtn.disabled = true;
  try {
    const extension = recordedBlob.type.includes('webm') ? 'webm' : 'ogg';
    const fileName = `${name}.${extension}`;
    const downloadURL = await backend.uploadRecording(recordedBlob, fileName);
    await backend.saveRecording(currentUser.uid, name, {
      url: downloadURL,
      createdAt: new Date()
    });
    alert(`「${name}」を保存しました！`);
    recordingNameInput.value = '';
  } catch (error) {
    console.error("録音の保存に失敗:", error);
    alert("録音の保存に失敗しました。");
  } finally {
    saveRecordingBtn.textContent = '☁️ クラウドに保存';
    saveRecordingBtn.disabled = false;
  }
});

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

// 最初のUI更新
updatePadsUI();

// =========================
// MODE / PRESET SLIDER (3 modes: 0=synth, 1=gojuon, 2=game)
// =========================

const modeSlider = document.getElementById("mode-slider");
const modeName   = document.getElementById("mode-name");
const pageSynth  = document.getElementById("page-synth");
const pageGojuon = document.getElementById("page-gojuon");
const pageGame   = document.getElementById("page-game");

function showOnlyPage(target) {
  document.querySelectorAll(".mode-page").forEach(p => {
    p.style.display = "none";
    p.classList.remove("mode-page-active");
  });
  if (target) {
    target.style.display = "block";
    target.classList.add("mode-page-active");
  }
}

function setModeFromValue(val) {
  const v = parseInt(val, 10) || 0;
  if (!pageSynth || !pageGojuon || !pageGame) return;

  if (v === 0) {
    // 8bit Synth
    showOnlyPage(pageSynth);
    if (modeName) modeName.textContent = " 8bitシンセ";
  } else if (v === 1) {
    // Gojuon mode
    showOnlyPage(pageGojuon);
    if (modeName) modeName.textContent = " 五十音モード";
  } else if (v === 2) {
    // Melody Game
    showOnlyPage(pageGame);
    if (modeName) modeName.textContent = " メロディゲーム";
  }
}

if (modeSlider) {
  modeSlider.addEventListener("input", () => {
    setModeFromValue(modeSlider.value);
  });
  // initial state
  setModeFromValue(modeSlider.value || 0);
}

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

// ====== VOICEVOX (TTSQuest) ======
(function(){
  const input   = document.getElementById('ttsInput');
  const btn     = document.getElementById('ttsBtn');
  const status  = document.getElementById('ttsStatus');
  const audioEl = document.getElementById('ttsAudio');
  const sel     = document.getElementById('ttsSpeakerSel');
  if (!input || !btn || !status || !audioEl || !sel) return;

  try { audioEl.crossOrigin = 'anonymous'; } catch {}
  const sameOriginOrBlob = (url) => {
    try { const u = new URL(url, location.href); return u.origin === location.origin || u.protocol === 'blob:'; }
    catch { return false; }
  };
  function tryWire(audio) {
    if (typeof ensureAudioGraph !== 'function' || typeof wireAudioElement !== 'function') return;
    if (sameOriginOrBlob(audio.src)) {
      try { ensureAudioGraph(); wireAudioElement(audio); } catch {}
    }
  }

  const FALLBACK_SPEAKERS = [
    { speaker: 12, name: '玄野武宏（ノーマル）' },
    { speaker: 13, name: '白上虎太郎（ノーマル）' },
    { speaker: 14, name: '青山龍星（ノーマル）' },
    { speaker: 18, name: '剣崎雌雄（ノーマル）' },
    { speaker: 5,  name: 'ずんだもん（ノーマル）' },
    { speaker: 1,  name: '四国めたん（ノーマル）' },
  ];
  const SPEAKERS_URL = 'https://deprecatedapis.tts.quest/v2/voicevox/speakers/';

  async function loadSpeakers(){
    try {
      status.textContent = 'Loading voices…';
      const res = await fetch(SPEAKERS_URL, { method:'GET' });
      const text = await res.text();
      let list;
      try { list = JSON.parse(text); } catch { list = null; }
      const speakers = Array.isArray(list) && list.length ? list : FALLBACK_SPEAKERS;
      sel.innerHTML = '';
      for (const s of speakers){
        const opt = document.createElement('option');
        opt.value = String(s.speaker);
        opt.textContent = `${s.name}（ID:${s.speaker}）`;
        sel.appendChild(opt);
      }
      const saved = sessionStorage.getItem('ttsSpeakerId');
      if (saved && sel.querySelector(`option[value="${saved}"]`)) sel.value = saved;
      status.textContent = 'Idle.';
    } catch {
      sel.innerHTML = '';
      for (const s of FALLBACK_SPEAKERS){
        const opt = document.createElement('option');
        opt.value = String(s.speaker);
        opt.textContent = `${s.name}（ID:${s.speaker}）`;
        sel.appendChild(opt);
      }
      status.textContent = 'Idle.';
    }
  }
  loadSpeakers();
  sel.addEventListener('change', () => {
    sessionStorage.setItem('ttsSpeakerId', sel.value);
  });

  let inflight = null;
  let cooldownUntil = 0;
  const COOLDOWN_MS = 2200;

  const setBusy = (b, label) => {
    input.disabled = b; btn.disabled = b; sel.disabled = b;
    btn.textContent = b ? (label || '生成中…') : '▶ 再生';
  };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  async function getJSONWith429(url, opts = {}, maxRetries = 3){
    for (let attempt = 0; attempt <= maxRetries; attempt++){
      const res = await fetch(url, opts);
      if (res.status !== 429){
        const text = await res.text();
        try { return JSON.parse(text); }
        catch { throw new Error(`Bad JSON (${res.status}) ${text.slice(0,160)}`); }
      }
      const retryAfter = parseInt(res.headers.get('Retry-After') || '0', 10);
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : (1200 * (attempt + 1));
      status.textContent = `Rate limited — retry in ${Math.ceil(waitMs/1000)}s…`;
      await sleep(waitMs);
    }
    throw new Error('Rate limited (429): retries exhausted.');
  }
  async function getStatusJSON(statusUrl, maxRetries = 6){
    let delay = 650, lastErr = null;
    for (let i = 0; i < maxRetries; i++){
      try { return await getJSONWith429(statusUrl, { method:'GET' }, 1); }
      catch(e){ lastErr = e; await sleep(delay); delay = Math.min(3000, Math.round(delay*1.4)); }
    }
    throw new Error(`Status polling failed${lastErr ? ` (${lastErr.message})` : ''}`);
  }

  async function synthesizeAndPlay(text){
    const now = Date.now();
    if (now < cooldownUntil){ status.textContent = `Please wait…`; return; }
    if (inflight){ status.textContent = 'Already synthesizing…'; return; }
    if (!text || !text.trim()){ status.textContent = 'Type some text first :)'; return; }

    const speakerId = Number(sel.value || 12);
    setBusy(true); status.textContent = 'Requesting synthesis…';
    const start = Date.now();
    const body = new URLSearchParams({ text: text.trim(), speaker: String(speakerId) });

    try {
      inflight = (async () => {
        const init = await getJSONWith429('https://api.tts.quest/v3/voicevox/synthesis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
          body
        }, 3);
        if (!init || init.success === false) throw new Error(init?.message || 'TTS request failed (init)');
        if (!init.audioStatusUrl && !init.mp3DownloadUrl) throw new Error('No status or download URL from API.');

        let mp3Url = init.mp3DownloadUrl || null;
        let statusUrl = init.audioStatusUrl || null;
        if (!mp3Url && statusUrl){
          status.textContent = 'Generating audio…';
          let ready = false, delay = 750;
          for (let i=0;i<18;i++){
            await sleep(delay);
            delay = Math.min(3000, Math.round(delay*1.22));
            const s = await getStatusJSON(statusUrl, 1);
            if (s?.isAudioReady){ mp3Url = s.mp3DownloadUrl || mp3Url; ready = true; break; }
            if (s?.retryAfter) delay = Math.max(delay, s.retryAfter*1000);
          }
          if (!ready || !mp3Url) throw new Error('Audio not ready (timeout).');
        }

        async function playUrl(u){
          status.textContent = 'Playing…';
          audioEl.src = u; tryWire(audioEl);
          audioEl.currentTime = 0;
          try { await audioEl.play(); }
          catch { status.innerHTML = `Autoplay blocked — <a href="${u}" target="_blank" rel="noopener">click to play</a>`; }
          audioEl.onended = () => { status.textContent = 'Idle.'; };
        }
        audioEl.onerror = async () => {
          audioEl.onerror = null;
          if (statusUrl){
            try {
              status.textContent = 'Refreshing audio link…';
              const s = await getStatusJSON(statusUrl, 2);
              const fresh = s?.mp3DownloadUrl;
              if (fresh && fresh !== mp3Url){ mp3Url = fresh; await playUrl(mp3Url); return; }
            } catch {}
          }
          status.textContent = 'Audio failed to load. Try again.';
        };
        await playUrl(mp3Url);

        const elapsed = Date.now() - start;
        cooldownUntil = Date.now() + Math.max(COOLDOWN_MS, 800 - Math.min(elapsed, 800));
      })();
      await inflight;
    } catch (err) {
      console.error(err);
      status.textContent = `Error: ${err.message || err}`;
      cooldownUntil = Date.now() + 2000;
    } finally {
      setBusy(false);
      inflight = null;
    }
  }

  btn.addEventListener('click', () => synthesizeAndPlay(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); synthesizeAndPlay(input.value); }
  });
})();

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
  const pageGame = document.getElementById('page-game');
  const isGameActive = pageGame && pageGame.classList.contains('mode-page-active');
  if (!isGameActive) return;          // Do nothing if game page is not active
  if (!isUserTurn || isPlayingSequence || sequence.length === 0 || isPaused) return;

  const key = e.key.toLowerCase();
  if (key === 'i') { e.preventDefault(); handleUserPad(0); }
  if (key === 'o') { e.preventDefault(); handleUserPad(1); }
  if (key === 'k') { e.preventDefault(); handleUserPad(2); }
  if (key === 'l') { e.preventDefault(); handleUserPad(3); }
});

// // =============================
// //  💬 Voice Chat (STT → TTS)
// // =============================
// (function () {
//   const startBtn = document.getElementById('vc-start');
//   const stopBtn  = document.getElementById('vc-stop');
//   const statusEl = document.getElementById('vc-status');
//   const textBox  = document.getElementById('vc-text');
//   const toTtsBtn = document.getElementById('vc-to-tts');

//   const ttsInput = document.getElementById('ttsInput');
//   const ttsBtn   = document.getElementById('ttsBtn');

//   if (!startBtn || !statusEl || !textBox) return;

//   const SpeechRecognition =
//     window.SpeechRecognition || window.webkitSpeechRecognition;

//   if (!SpeechRecognition) {
//     statusEl.textContent = 'このブラウザは音声認識に対応していません。Chrome系を使ってください。';
//     startBtn.disabled = true;
//     stopBtn.disabled = true;
//     return;
//   }

//   const recog = new SpeechRecognition();
//   recog.lang = 'ja-JP';
//   recog.interimResults = true;
//   recog.continuous = false;

//   let finalText = '';

//   function setStatus(text) {
//     statusEl.textContent = text;
//   }

//   startBtn.addEventListener('click', () => {
//     finalText = '';
//     textBox.textContent = '';
//     setStatus('マイク待機中…（許可ダイアログが出たら「許可」を押してください）');
//     startBtn.disabled = true;
//     stopBtn.disabled = false;
//     try {
//       recog.start();
//     } catch {
//       // already started
//     }
//   });

//   stopBtn.addEventListener('click', () => {
//     try { recog.stop(); } catch {}
//     stopBtn.disabled = true;
//   });

//   recog.onstart = () => {
//     setStatus('録音中…話してください');
//   };

//   recog.onresult = (evt) => {
//     let interim = '';
//     finalText = '';

//     for (let i = 0; i < evt.results.length; i++) {
//       const res = evt.results[i];
//       if (res.isFinal) {
//         finalText += res[0].transcript;
//       } else {
//         interim += res[0].transcript;
//       }
//     }

//     const displayText = finalText || interim;
//     textBox.textContent = displayText || '（まだ何も認識されていません）';
//   };

//   recog.onerror = (evt) => {
//     console.warn('speech error', evt);
//     setStatus('エラー: ' + (evt.error || 'unknown'));
//     startBtn.disabled = false;
//     stopBtn.disabled = true;
//   };

//   recog.onend = () => {
//     setStatus('Idle.');
//     startBtn.disabled = false;
//     stopBtn.disabled = true;
//   };

//   // 認識したテキストを TTS パネルへコピーして再生
//   toTtsBtn.addEventListener('click', () => {
//     const txt = textBox.textContent.trim();
//     if (!txt || txt.startsWith('（まだ')) {
//       setStatus('読み上げるテキストがありません。');
//       return;
//     }
//     if (!ttsInput || !ttsBtn) {
//       setStatus('TTSパネルが見つかりません。');
//       return;
//     }
//     ttsInput.value = txt;
//     // 既存の TTS ボタンをそのまま使う
//     ttsBtn.click();
//     setStatus('テキストをTTSに送りました。');
//   });
// })();
