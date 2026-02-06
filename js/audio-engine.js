import * as store from './store.js';
import { freqs } from './constants.js';
import { isNoteInScale } from './ui.js';
import { getChordFrequencies } from './chord-builder.js';

// エフェクトの 'apply' 関数をインポート
import { applyDistortion } from './effects/distortion.js';
import { applyBitCrusher } from './effects/bitcrusher.js';
import { applyLoFi } from './effects/lofi.js';
import { applyFilter } from './effects/filter.js';
import { applySlicer } from './effects/slicer.js';
import { applyUnyounyo } from './effects/unyounyo.js';
import { applyFlanger } from './effects/flanger.js';
import { applyDelay } from './effects/delay.js';
import { applyReverb } from './effects/reverb.js';
import { applyFuzz } from './effects/fuzz.js';


// --- ヘルパー関数 (変更なし) ---
export function getNoteDurationInSeconds(noteString) {
    let isDotted = false, noteValue = noteString;
    if (typeof noteValue === 'string' && noteValue.endsWith('d')) {
        isDotted = true;
        noteValue = noteValue.slice(0, -1);
    }
    noteValue = parseFloat(noteValue);
    const bpm = store.getBpm();
    if (isNaN(noteValue) || bpm === 0) return 0;
    let duration = (60 / bpm) * (4 / noteValue);
    if (isDotted) duration *= 1.5;
    return duration;
}
export function getNoteFrequencyInHz(noteValue) {
    const duration = getNoteDurationInSeconds(noteValue);
    return duration > 0 ? 1 / duration : 0;
}
const semitonesToPlaybackRate = (semitones) => Math.pow(2, semitones / 12);

// --- エフェクトチェーン構築 ---
function buildEffectChain(startNode, externalNodes = {}) {
    const audioCtx = store.audioCtx;
    let lastNode = startNode;
    let cleanupFunctions = [];
    let effectCount = 0;
    
    document.querySelectorAll('.control-panel input[type="checkbox"]').forEach(cb => { 
        if (cb.id !== 'toggle-pentatonic' && cb.id !== 'toggle-pad-polyphony' && !cb.id.startsWith('pad-invert-') && !cb.id.startsWith('chord-mode-') && cb.checked) {
            effectCount++;
        }
    });
    
    if (effectCount > 0) {
        const makeupGain = audioCtx.createGain();
        makeupGain.gain.value = 1 + (effectCount * 0.1); 
        lastNode.connect(makeupGain);
        lastNode = makeupGain;
    }
    
    if (document.getElementById("toggle-distortion")?.checked) {
        const res = applyDistortion(audioCtx, lastNode);
        lastNode = res.outputNode; if (res.cleanup) cleanupFunctions.push(res.cleanup);
    }
    if (document.getElementById("toggle-fuzz")?.checked) {
        const res = applyFuzz(audioCtx, lastNode);
        lastNode = res.outputNode; if (res.cleanup) cleanupFunctions.push(res.cleanup);
    }
    if (document.getElementById("toggle-bitcrusher")?.checked) { 
        const res = applyBitCrusher(audioCtx, lastNode);
        lastNode = res.outputNode; if (res.cleanup) cleanupFunctions.push(res.cleanup);
    }
    if (document.getElementById("toggle-lofi")?.checked) { 
        const res = applyLoFi(audioCtx, lastNode);
        lastNode = res.outputNode; if (res.cleanup) cleanupFunctions.push(res.cleanup);
    }
    let filterNodeForLFO = null;
    if (document.getElementById("toggle-filter")?.checked) { 
        const res = applyFilter(audioCtx, lastNode);
        filterNodeForLFO = res.outputNode; 
        lastNode = res.outputNode;
        if (res.cleanup) cleanupFunctions.push(res.cleanup);
    }
    if (externalNodes.lfoFilterGain && filterNodeForLFO) {
        externalNodes.lfoFilterGain.connect(filterNodeForLFO.frequency);
    }
    if (document.getElementById("toggle-slicer")?.checked) {
        const res = applySlicer(audioCtx, lastNode, { getNoteDurationInSeconds });
        lastNode = res.outputNode; if (res.cleanup) cleanupFunctions.push(res.cleanup);
    }
    if (document.getElementById("toggle-unyounyo")?.checked) { 
        const res = applyUnyounyo(audioCtx, lastNode);
        lastNode = res.outputNode; if (res.cleanup) cleanupFunctions.push(res.cleanup);
    }
    if (document.getElementById("toggle-flanger")?.checked) { 
        const res = applyFlanger(audioCtx, lastNode, { getNoteFrequencyInHz });
        lastNode = res.outputNode; if (res.cleanup) cleanupFunctions.push(res.cleanup);
    }
    if (document.getElementById("toggle-delay")?.checked) { 
        const res = applyDelay(audioCtx, lastNode, { getNoteDurationInSeconds });
        lastNode = res.outputNode; if (res.cleanup) cleanupFunctions.push(res.cleanup);
    }
    if (document.getElementById("toggle-reverb")?.checked) { 
        const res = applyReverb(audioCtx, lastNode);
        lastNode = res.outputNode; if (res.cleanup) cleanupFunctions.push(res.cleanup);
    }
    
    return { lastNode, cleanupFunctions };
}

// --- コードモード対応 ---
function _createTone(freq) {
    const audioCtx = store.audioCtx;
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
    
    const { lastNode, cleanupFunctions } = buildEffectChain(ampEnv, { lfoFilterGain });
    
    // 鍵盤の音はルーパーの入力 (masterGain) に接続する
    lastNode.connect(store.masterGain);
    
    return { osc, ampEnv, pwm_lfo, lfo, cleanup: cleanupFunctions };
}

function _stopToneInternal(toneData) {
    if (!toneData) return;
    
    const audioCtx = store.audioCtx;
    const now = audioCtx.currentTime;
    const releaseTime = parseFloat(document.getElementById('env-release').value);
    
    toneData.ampEnv.gain.cancelScheduledValues(now);
    toneData.ampEnv.gain.setTargetAtTime(0, now, releaseTime / 5);
    toneData.osc.stop(now + releaseTime);
    
    if (toneData.pwm_lfo) toneData.pwm_lfo.stop(now + releaseTime);
    if (toneData.lfo) toneData.lfo.stop(now + releaseTime);
    
    if (toneData.cleanup && Array.isArray(toneData.cleanup)) {
        toneData.cleanup.forEach(func => {
            if (typeof func === 'function') {
                func();
            }
        });
    }
}

export function startTone(rootFreq) {
    const audioCtx = store.audioCtx;
    if (audioCtx.state === "suspended") audioCtx.resume();
    
    const noteName = Object.keys(freqs).find(key => freqs[key] === rootFreq);
    if (!isNoteInScale(noteName)) return;

    let frequenciesToPlay = [];
    
    if (store.isChordMode()) {
        const key = store.getCurrentKey();
        const mode = store.getCurrentMode();
        frequenciesToPlay = getChordFrequencies(noteName, key, mode);
    } else {
        frequenciesToPlay = [rootFreq];
    }

    const activeOscillators = [];
    
    frequenciesToPlay.forEach(freq => {
        const toneData = _createTone(freq);
        toneData.osc.start();
        activeOscillators.push(toneData);
    });

    store.addActiveOscillator(rootFreq, activeOscillators);
}

export function stopTone(rootFreq) {
    const activeOscillators = store.getActiveOscillator(rootFreq);
    
    if (activeOscillators && Array.isArray(activeOscillators)) {
        store.removeActiveOscillator(rootFreq); 

        activeOscillators.forEach(toneData => {
            _stopToneInternal(toneData);
        });
    }
}

// --- サンプラー (バグ修正済み) ---
export function playUploaded(index, loop = false) {
    const audioCtx = store.audioCtx;
    const state = store.getPadState(index);
    if (!state || !state.buffer) return;
    if (audioCtx.state === "suspended") audioCtx.resume();

    const isPolyphonic = document.getElementById('toggle-pad-polyphony').checked;
    if (!isPolyphonic) {
        store.stopAndRemoveSampleSources(index); 
    }

    const src = audioCtx.createBufferSource();
    src.buffer = state.buffer;
    src.playbackRate.value = semitonesToPlaybackRate(store.getCurrentPitchShift());
    src.loop = loop;
    
    const mainGain = audioCtx.createGain();
    const isInverted = document.getElementById(`pad-invert-${index}`).checked;
    const volume = (parseFloat(document.getElementById("uploadedVolume").value) || 1) * 10;
    mainGain.gain.value = isInverted ? (volume * -1) : volume;

    src.connect(mainGain);
    
    // サンプラーもエフェクトを構築する
    const { lastNode, cleanupFunctions } = buildEffectChain(mainGain);
    
    // サンプラーはルーパー (masterGain) をバイパスし、
    // 最終出口 (mainOutputBus) に直接接続する
    lastNode.connect(store.mainOutputBus);

    src.start();

    const sourceInfo = { index: index, source: src, cleanup: cleanupFunctions };
    store.addActiveSampleSource(sourceInfo);

    src.onended = () => {
        if (sourceInfo.cleanup && Array.isArray(sourceInfo.cleanup)) {
            sourceInfo.cleanup.forEach(func => {
                if (typeof func === 'function') {
                    func();
                }
            });
        }
        store.removeActiveSampleSource(sourceInfo.source);
    };
}

// --- ピッチシフト (変更なし) ---
export function updatePitchShift(newPitch) {
    store.setCurrentPitchShift(newPitch);
    document.getElementById('pitch-shift-display').textContent = newPitch;
    
    const newRate = semitonesToPlaybackRate(newPitch);
    const audioCtx = store.audioCtx;
    
    store.getActiveSampleSources().forEach(s => {
        if (s.source && s.source.playbackRate) {
            s.source.playbackRate.setValueAtTime(newRate, audioCtx.currentTime);
        }
    });
}