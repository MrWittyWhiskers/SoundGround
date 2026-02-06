import * as store from './store.js';

let whiteNoiseBuffer = null;
let drumMasterGain = null;

function createWhiteNoise() {
    const audioCtx = store.audioCtx;
    const bufferSize = 2 * audioCtx.sampleRate;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
    }
    whiteNoiseBuffer = buffer;
}

/**
 * 軽いサチュレーション（歪み）カーブを生成します
 */
function makeSoftClipCurve(amount) {
    const k = typeof amount === 'number' ? amount : 2; // 👈 歪みカーブを少し緩やかに
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    
    for (let i = 0; i < n_samples; ++i) {
        const x = (i * 2 / n_samples) - 1;
        curve[i] = Math.tanh(x * k);
    }
    return curve;
}

export function init() {
    if (!whiteNoiseBuffer) {
        createWhiteNoise();
    }
    
    drumMasterGain = store.audioCtx.createGain();
    const volumeSlider = document.getElementById("drum-volume");
    drumMasterGain.gain.value = parseFloat(volumeSlider ? volumeSlider.value : 5.0);
    drumMasterGain.connect(store.masterGain);
    
    console.log("Drum sounds synthesized.");
}

export function updateDrumVolume(value) {
    if (drumMasterGain) {
        drumMasterGain.gain.setValueAtTime(value, store.audioCtx.currentTime);
    }
}

export function playSound(soundName) {
    if (!drumMasterGain) return;

    const audioCtx = store.audioCtx;
    if (audioCtx.state === "suspended") audioCtx.resume();
    
    const now = audioCtx.currentTime;

    switch (soundName) {
        
        // --- ▼▼▼ KICK を修正 ▼▼▼ ---
        case 'kick': {
            // 1. 胴鳴り (Body) - サイン波
            const bodyOsc = audioCtx.createOscillator();
            bodyOsc.type = 'sine';
            
            // ▼▼▼ ピッチの降下を「ドンッ」にする ▼▼▼
            // (150Hz -> 30Hz へ 0.05秒で急降下)
            bodyOsc.frequency.setValueAtTime(150, now);
            bodyOsc.frequency.exponentialRampToValueAtTime(30, now + 0.05);
            // ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

            // 2. サチュレーターに送る前のゲイン (音を太くする)
            const preGain = audioCtx.createGain();
            // ▼▼▼ 歪みを強くするためにブースト値を 2.5 -> 3.5 に変更 ▼▼▼
            preGain.gain.value = 3.5;
            // ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

            // 3. 歪み (Saturation)
            const saturator = audioCtx.createWaveShaper();
            saturator.curve = makeSoftClipCurve(2.0); // 緩やかなカーブで太く歪ませる

            // 4. 音量 (Gain)
            const bodyGain = audioCtx.createGain();
            bodyGain.gain.setValueAtTime(1.0, now);
            // ▼▼▼ 音の長さを 0.15秒 に設定 ▼▼▼
            bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            // ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

            // 接続: Osc -> preGain -> Saturator -> Gain -> Drum Master
            bodyOsc.connect(preGain);
            preGain.connect(saturator);
            saturator.connect(bodyGain);
            bodyGain.connect(drumMasterGain);
            
            bodyOsc.start(now);
            bodyOsc.stop(now + 0.15);

            // 5. アタック (Click) - 短いノイズ
            const clickNoise = audioCtx.createBufferSource();
            clickNoise.buffer = whiteNoiseBuffer;
            const clickFilter = audioCtx.createBiquadFilter();
            clickFilter.type = 'lowpass'; // 👈 高音をカット (Highpassから変更)
            clickFilter.frequency.value = 1500; // 👈 1.5kHz以上をカット
            const clickGain = audioCtx.createGain();
            clickGain.gain.setValueAtTime(0.4, now); // アタック音量を調整
            clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.01); // 0.01秒で消える

            clickNoise.connect(clickFilter).connect(clickGain);
            clickGain.connect(drumMasterGain);

            clickNoise.start(now);
            clickNoise.stop(now + 0.02);
            
            break;
        }
        // --- ▲▲▲ KICK 修正ここまで ▲▲▲ ---

        // === SNARE (Iキー) ===
        case 'snare': {
            // ... (変更なし) ...
            const noise = audioCtx.createBufferSource();
            noise.buffer = whiteNoiseBuffer;
            const noiseFilter = audioCtx.createBiquadFilter();
            noiseFilter.type = 'highpass';
            noiseFilter.frequency.value = 1000;
            const noiseEnv = audioCtx.createGain();
            noiseEnv.gain.setValueAtTime(1.0, now);
            noiseEnv.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            noise.connect(noiseFilter).connect(noiseEnv);
            noiseEnv.connect(drumMasterGain);
            const body = audioCtx.createOscillator();
            body.type = 'triangle';
            body.frequency.setValueAtTime(100, now);
            const bodyEnv = audioCtx.createGain();
            bodyEnv.gain.setValueAtTime(0.7, now);
            bodyEnv.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
            body.connect(bodyEnv);
            bodyEnv.connect(drumMasterGain);
            noise.start(now);
            body.start(now);
            noise.stop(now + 0.1);
            body.stop(now + 0.08);
            break;
        }

        // === HIHAT (Oキー) ===
        case 'hihat': {
            // ... (変更なし) ...
            const noise = audioCtx.createBufferSource();
            noise.buffer = whiteNoiseBuffer;
            const noiseFilter = audioCtx.createBiquadFilter();
            noiseFilter.type = 'highpass';
            noiseFilter.frequency.value = 5000;
            const noiseEnv = audioCtx.createGain();
            noiseEnv.gain.setValueAtTime(0.8, now);
            noiseEnv.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
            noise.connect(noiseFilter).connect(noiseEnv);
            noiseEnv.connect(drumMasterGain);
            noise.start(now);
            noise.stop(now + 0.05);
            break;
        }

        // === CLAP (Pキー) ===
        case 'clap': {
            // ... (変更なし) ...
            const noise = audioCtx.createBufferSource();
            noise.buffer = whiteNoiseBuffer;
            const noiseFilter = audioCtx.createBiquadFilter();
            noiseFilter.type = 'bandpass';
            noiseFilter.frequency.value = 1500;
            const noiseEnv = audioCtx.createGain();
            noiseEnv.gain.setValueAtTime(1.0, now);
            noiseEnv.gain.setValueAtTime(0.0, now + 0.01);
            noiseEnv.gain.setValueAtTime(1.0, now + 0.012);
            noiseEnv.gain.setValueAtTime(0.0, now + 0.02);
            noiseEnv.gain.setValueAtTime(1.0, now + 0.022);
            noiseEnv.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            noise.connect(noiseFilter).connect(noiseEnv);
            noiseEnv.connect(drumMasterGain);
            noise.start(now);
            noise.stop(now + 0.1);
            break;
        }
    }

    // UIのフィードバック
    const pad = document.querySelector(`.drum-pad[data-sound="${soundName}"]`);
    if (pad) {
        pad.classList.add('active');
        setTimeout(() => pad.classList.remove('active'), 100);
    }
}

/**
 * プリセットデータに基づいてドラムマシンの音源URLを更新する
 * @param {object} presetData - パッド情報を含むオブジェクト
 */
export function updateSounds(presetData) {
    if (!presetData || !presetData.pads) return;

    // ドラムパッド（U, I, O, P）に対応する音源があれば更新するロジック
    // ※ 構成に合わせて、特定のパッド番号をドラム音として割り当てる例
    console.log("DrumMachine: Sounds updated via preset.");
    
    // 必要に応じてドラムマシンの内部バッファをリロードする処理をここに記述
}