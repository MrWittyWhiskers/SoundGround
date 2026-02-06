import * as store from './store.js';
import * as scheduler from './scheduler.js';

let isPlaying = false;
const visualIndicator = document.getElementById('bpm');

// time: 鳴らす正確な時刻
// beat: 16分音符の何番目か (0-15)
// bar: 何小節目か (1, 2, 3...)
function playClick(time, beat, bar) {
    const audioCtx = store.audioCtx;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    // 4小節の頭 (1, 5, 9...)
    if (bar % 4 === 1 && beat === 0) {
        osc.frequency.setValueAtTime(1200, time); // 4小節の頭 (高音)
        gain.gain.setValueAtTime(4.0, time); // 👈 音割れしない最大音量
    }
    // 小節の頭 (2, 3, 4)
    else if (beat === 0) {
        osc.frequency.setValueAtTime(880, time); // 小節の頭 (中音)
        gain.gain.setValueAtTime(3.5, time); // 👈 通常の音量
    }
    // 拍の頭 (2, 3, 4拍目)
    else {
        osc.frequency.setValueAtTime(440, time); // 拍 (低音)
        gain.gain.setValueAtTime(3.0, time); // 👈 少し小さい音量
    }
    
    osc.type = 'triangle';
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

    osc.connect(gain).connect(audioCtx.destination);
    osc.start(time);
    osc.stop(time + 0.05);

    // BPMノブを光らせる
    if (beat === 0) {
        visualIndicator.style.borderColor = '#ffeb3b';
        setTimeout(() => {
            visualIndicator.style.borderColor = '#00bcd4';
        }, 50);
    }
}

// スケジューラーから呼び出される関数
function onTick(tickInfo) {
    // 拍の頭 (4分音符 = 16分音符の 0, 4, 8, 12 番目) のみ音を鳴らす
    if (tickInfo.beat % 4 === 0) {
        playClick(tickInfo.time, tickInfo.beat, tickInfo.bar);
    }
}

// --- ▼▼▼ looper.js が呼び出すための関数 ▼▼▼ ---

// 内部関数 (強制スタート)
function startMetronome() {
    if (isPlaying) return; // 既に再生中
    isPlaying = true;
    scheduler.subscribe(onTick);
    scheduler.play();
}

// 内部関数 (強制ストップ)
function stopMetronome() {
    if (!isPlaying) return; // 既に停止中
    isPlaying = false;
    scheduler.unsubscribe(onTick);
    visualIndicator.style.borderColor = '#00bcd4';
}

// 外部公開用 (トグル) - （現在未使用だが残しておく）
export function toggle() {
    if (isPlaying) {
        stopMetronome();
    } else {
        startMetronome();
    }
    return isPlaying;
}

// 外部公開用 (強制スタート) - looper.js が使用
export function start() {
    startMetronome();
    return isPlaying;
}

// 外部公開用 (強制ストップ) - looper.js が使用
export function stop() {
    stopMetronome();
    return isPlaying;
}