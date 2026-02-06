// audioCtxと全ノードをここで定義し、状態（BPMなど）も管理する
export const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// --- オーディオノード ---
export const masterGain = audioCtx.createGain(); // 演奏(シンセ/パッド)の出口
export const looperInNode = audioCtx.createGain(); // ルーパーの入力
export const mainOutputBus = audioCtx.createGain(); // 最終合流点
export const streamDestination = audioCtx.createMediaStreamDestination(); // WAV録音用

// --- オーディオ経路の構築 ---
masterGain.connect(looperInNode);
masterGain.connect(mainOutputBus);
mainOutputBus.connect(audioCtx.destination);
mainOutputBus.connect(streamDestination);

// --- グローバル状態変数 ---
let _bpm = 120;
let _padStates = Array(9).fill(null).map(() => ({
    buffer: null, url: null, name: "", inverted: false
}));
let _activeOscillators = {};
let _activeSampleSources = [];
let _isPentatonicMode = false;
let _currentUser = null;
let _currentKey = 'ド';
let _activePentatonicScale = [];
let _currentPitchShift = 0;

// ▼▼▼ コードモード用の変数を追加 ▼▼▼
let _isChordMode = false;
let _currentMode = 'Major'; // 'Major' または 'Minor'
// ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

// --- ゲッター (状態の読み取り) ---
export const getBpm = () => _bpm;
export const getPadStates = () => _padStates;
export const getPadState = (i) => _padStates[i];
export const getActiveOscillators = () => _activeOscillators;
export const getActiveSampleSources = () => _activeSampleSources;
export const isPentatonicMode = () => _isPentatonicMode;
export const getCurrentUser = () => _currentUser;
export const getCurrentKey = () => _currentKey;
export const getActivePentatonicScale = () => _activePentatonicScale;
export const getCurrentPitchShift = () => _currentPitchShift;

// ▼▼▼ エラーを解消するために、以下の2つのゲッターを追加 ▼▼▼
export const isChordMode = () => _isChordMode;
export const getCurrentMode = () => _currentMode;
// ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

// --- セッター (状態の変更) ---
export const setBpm = (value) => { _bpm = value; };
export const setPadStates = (states) => { _padStates = states; };
export const setPadState = (i, state) => { _padStates[i] = state; };
export const setPentatonicMode = (value) => { _isPentatonicMode = value; };
export const setCurrentUser = (user) => { _currentUser = user; };
export const setCurrentKey = (key) => { _currentKey = key; };
export const setActivePentatonicScale = (scale) => { _activePentatonicScale = scale; };
export const setCurrentPitchShift = (pitch) => { _currentPitchShift = pitch; };

// ▼▼▼ 以下の2つのセッターを追加 ▼▼▼
export const setChordMode = (value) => { _isChordMode = value; };
export const setCurrentMode = (mode) => { _currentMode = mode; };
// ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

// --- オシレーター/ソースの管理 ---
export const addActiveOscillator = (freq, oscData) => {
    _activeOscillators[freq] = oscData;
};
export const removeActiveOscillator = (freq) => {
    delete _activeOscillators[freq];
};
export const getActiveOscillator = (freq) => {
    return _activeOscillators[freq];
};
export const addActiveSampleSource = (sourceInfo) => {
    _activeSampleSources.push(sourceInfo);
};
export const removeActiveSampleSource = (source) => {
    _activeSampleSources = _activeSampleSources.filter(s => s.source !== source);
};
export const stopAndRemoveSampleSources = (indexToStop) => {
    const sourcesToStop = _activeSampleSources.filter(s => s.index === indexToStop);
    sourcesToStop.forEach(s => {
        try {
            s.source.stop();
            s.cleanup.forEach(func => func());
        } catch (e) { /* 無視 */ }
    });
    _activeSampleSources = _activeSampleSources.filter(s => s.index !== indexToStop);
};