import * as store from './store.js';
import * as scheduler from './scheduler.js';
import * as metronome from './metronome.js'; // 👈 インポートを復活

const audioCtx = store.audioCtx;
const loopLengthInBars = 4;
let loopDuration = 0.0;

let delayNode = null;
let feedbackGain = null;
let inputGain = null;
let loopGain = null;

let uiMetroBtn = null; // 👈 メトロノームボタンを保持する変数

const looperState = {
    IDLE: 'IDLE',
    WAITING: 'WAITING',
    RECORDING: 'RECORDING'
};
let currentState = looperState.IDLE;
let onStateChangeCallback = null;

function setupNodes() {
    if (inputGain) inputGain.disconnect();
    if (delayNode) delayNode.disconnect();
    if (feedbackGain) feedbackGain.disconnect();
    if (loopGain) loopGain.disconnect();

    try {
        delayNode = audioCtx.createDelay(179.9);
    } catch (e) {
        console.error("createDelay failed:", e);
        alert("ルーパーの初期化に失敗しました。");
        return;
    }
    feedbackGain = audioCtx.createGain();
    inputGain = audioCtx.createGain();
    loopGain = audioCtx.createGain();

    store.looperInNode.connect(inputGain);
    inputGain.connect(delayNode);
    delayNode.connect(feedbackGain);
    delayNode.connect(loopGain);
    feedbackGain.connect(delayNode);
    loopGain.connect(store.mainOutputBus);
    
    inputGain.gain.value = 0.0;
    feedbackGain.gain.value = 0.0;
    loopGain.gain.value = 0.0;
    
    updateLoopTime();
}

function updateLoopTime() {
    const bpm = store.getBpm();
    if (bpm <= 0) return;
    
    const secondsPerBar = (60.0 / bpm) * 4;
    loopDuration = secondsPerBar * loopLengthInBars;
    
    if (delayNode) {
        delayNode.delayTime.setValueAtTime(loopDuration, audioCtx.currentTime);
    }
}

function onTick(tickInfo) {
    if (currentState === looperState.WAITING) {
        if (tickInfo.bar % loopLengthInBars === 1 && tickInfo.beat === 0) {
            console.log("Looper: Recording Started at", tickInfo.time);
            currentState = looperState.RECORDING;
            if (onStateChangeCallback) onStateChangeCallback(currentState);
            
            if (feedbackGain) feedbackGain.gain.setValueAtTime(0.995, audioCtx.currentTime);
            if (inputGain) inputGain.gain.setValueAtTime(1.0, audioCtx.currentTime);
            if (loopGain) loopGain.gain.setValueAtTime(1.0, audioCtx.currentTime);
        }
    }
}

// --- ▼▼▼ ボタンUIを更新する関数を追加 ▼▼▼ ---
function updateMetroButtonUI(isPlaying) {
    if (uiMetroBtn) {
        if (isPlaying) {
            uiMetroBtn.textContent = 'ON';
            uiMetroBtn.style.backgroundColor = '#4CAF50';
        } else {
            uiMetroBtn.textContent = 'OFF';
            uiMetroBtn.style.backgroundColor = '#607d8b';
        }
    }
}

/** ルーパーの初期化 */
export function init(metroBtnElement) { // 👈 metroBtn を受け取る
    uiMetroBtn = metroBtnElement; // 👈 変数に保持
    setupNodes();
    console.log("Overdub Looper Initialized");
}

/** BPM変更時に外部から呼び出す */
export function updateBpm() {
    updateLoopTime();
}

/** 録音/再生のトグル */
export function toggle() {
    let metroState = false;
    switch (currentState) {
        case looperState.IDLE:
        case looperState.PLAYING:
            currentState = looperState.WAITING;
            scheduler.subscribe(onTick);
            scheduler.play();
            metroState = metronome.start(); // 👈 メトロノーム起動
            break;

        case looperState.WAITING:
            currentState = looperState.IDLE;
            scheduler.unsubscribe(onTick);
            metroState = metronome.stop(); // 👈 メトロノーム停止
            break;
            
        case looperState.RECORDING:
            currentState = looperState.IDLE;
            scheduler.unsubscribe(onTick);
            metroState = metronome.stop(); // 👈 メトロノーム停止
            
            if (inputGain) inputGain.gain.setValueAtTime(0.0, audioCtx.currentTime);
            break;
    }
    updateMetroButtonUI(metroState); // 👈 ボタンのUIを同期
    if (onStateChangeCallback) onStateChangeCallback(currentState);
}

/** ループを即座にクリア */
export function clear() {
    if (inputGain) {
        inputGain.gain.setValueAtTime(0.0, audioCtx.currentTime);
    }
    if (feedbackGain) {
        feedbackGain.gain.setValueAtTime(0.0, audioCtx.currentTime);
    }
    if (loopGain) {
        loopGain.gain.setValueAtTime(0.0, audioCtx.currentTime);
    }
    
    currentState = looperState.IDLE;
    scheduler.unsubscribe(onTick);
    const metroState = metronome.stop(); // 👈 メトロノーム停止
    updateMetroButtonUI(metroState); // 👈 ボタンのUIを同期
    if (onStateChangeCallback) onStateChangeCallback(currentState);
}

export function onStateChange(callback) {
    onStateChangeCallback = callback;
}