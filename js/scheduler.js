import * as store from './store.js';

let timerID = null;
let nextNoteTime = 0.0;
let current16thNote = 0;
let currentBar = 1;
const scheduleAheadTime = 0.1;

// 16分音符の「tick」イベントを購読する関数のリスト
const subscribers = [];

// スケジューラー（心臓部）
function scheduler() {
    const audioCtx = store.audioCtx;
    const bpm = store.getBpm();
    if (bpm <= 0) return; // BPMが0だと無限ループするため停止

    const secondsPer16thNote = (60.0 / bpm) / 4.0;

    while (nextNoteTime < audioCtx.currentTime + scheduleAheadTime) {
        
        // ▼▼▼ tick情報を送信 ▼▼▼
        const tickInfo = {
            time: nextNoteTime, // このtickが鳴るべき正確な時刻
            beat: current16thNote, // 今が何番目のtickか (0-15)
            bar: currentBar //
        };
        subscribers.forEach(callback => callback(tickInfo));
        // ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

        // 次のノートの時間をスケジュール
        nextNoteTime += secondsPer16thNote;

        // 16分音符のカウンターを進める (4/4拍子 = 16)
        current16thNote++;
        if (current16thNote === 16) {
            current16thNote = 0;
            currentBar++;
        }
    }
    timerID = setTimeout(scheduler, 25.0);
}

export function play() {
    if (timerID) return; // すでに再生中

    const audioCtx = store.audioCtx;
    if (audioCtx.state === "suspended") {
        audioCtx.resume();
    }
    
    current16thNote = 0;
    currentBar = 1;
    nextNoteTime = audioCtx.currentTime + 0.1; // 少し未来から開始
    scheduler(); // スケジューラーを起動
}

export function stop() {
    if (timerID) {
        clearTimeout(timerID);
        timerID = null;
    }
    current16thNote = 0;
    currentBar = 1;
    subscribers.length = 0; 
}

/**
 * スケジューラーのtickイベントを購読（予約）します
 * @param {function} callback - tick情報 {time, beat} を受け取る関数
 */
export function subscribe(callback) {
    subscribers.push(callback);
}

/**
 * スケジューラーの購読を解除します
 * @param {function} callback - 登録した関数
 */
export function unsubscribe(callback) {
    const index = subscribers.indexOf(callback);
    if (index > -1) {
        subscribers.splice(index, 1);
    }
}