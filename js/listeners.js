import * as store from './store.js';
import * as audioEngine from './audio-engine.js';
import * as ui from './ui.js';
import { freqs, keyToNoteMap, noteOrder } from './constants.js';
import * as looper from './looper.js';
import * as drumMachine from './drum-machine.js';

const currentlyPressed = {};
let randomOsc = null;

export function initGlobalListeners() {
    // --- キーボード/パッド操作 ---
     window.addEventListener('keydown', e => {
        if (e.target.tagName === 'INPUT') return;
        
        const key = e.key;
        if (key === 'ArrowUp') {
            e.preventDefault();
            audioEngine.updatePitchShift(store.getCurrentPitchShift() + 1);
            return;
        }
        if (key === 'ArrowDown') {
            e.preventDefault();
            audioEngine.updatePitchShift(store.getCurrentPitchShift() - 1);
            return;
        }

        const lowerKey = key.toLowerCase();
        
        if (!currentlyPressed[lowerKey]) {
            let soundToPlay = null;
            if (lowerKey === 'u') soundToPlay = 'kick';
            else if (lowerKey === 'i') soundToPlay = 'snare';
            else if (lowerKey === 'o') soundToPlay = 'hihat';
            else if (lowerKey === 'p') soundToPlay = 'clap';

            if (soundToPlay) {
                currentlyPressed[lowerKey] = true;
                drumMachine.playSound(soundToPlay);
                return;
            }
        }
        
        if (isFinite(lowerKey) && lowerKey >= '1' && lowerKey <= '9' && lowerKey.trim() !== '') {
            const padIndex = parseInt(lowerKey, 10) - 1;
            const pad = document.querySelector(`.sample-pad[data-index="${padIndex}"]`);
            if (pad && pad.classList.contains('loaded') && !currentlyPressed[lowerKey]) {
                currentlyPressed[lowerKey] = true;
                pad.classList.add('active');
                audioEngine.playUploaded(padIndex, false);
            }
            return;
        }
        
        const note = keyToNoteMap[lowerKey];
        if (note && ui.isNoteInScale(note) && !currentlyPressed[lowerKey]) {
            currentlyPressed[lowerKey] = true;
            audioEngine.startTone(freqs[note]);
            const button = document.querySelector(`div[data-note="${note}"]`);
            if (button) button.classList.add('key-active');
        }
    });

    window.addEventListener('keyup', e => {
        const key = e.key.toLowerCase();
        
        if (['u', 'i', 'o', 'p'].includes(key) || (isFinite(key) && key >= '1' && key <= '9')) {
            delete currentlyPressed[key];
            
            if (isFinite(key) && key >= '1' && key <= '9') {
                 const padIndex = parseInt(key, 10) - 1;
                 const pad = document.querySelector(`.sample-pad[data-index="${padIndex}"]`);
                 if (pad) pad.classList.remove('active');
            }
            return;
        }

        const note = keyToNoteMap[key];
        if (note) {
            delete currentlyPressed[key];
            audioEngine.stopTone(freqs[note]);
            const button = document.querySelector(`div[data-note="${note}"]`);
            if (button) button.classList.remove('key-active');
        }
    });

    // --- UI要素のリスナー ---
    document.getElementById("bpm").addEventListener('input', e => {
        const newBpm = parseFloat(e.target.value) || 120;
        store.setBpm(newBpm); 
        looper.updateBpm();
    });
    document.getElementById("master-volume").addEventListener('input', e => {
        store.masterGain.gain.value = parseFloat(e.target.value);
    });
    document.getElementById('key-selector').addEventListener('change', e => {
        store.setCurrentKey(e.target.value);
        if (store.isPentatonicMode()) {
            ui.calculatePentatonicScale();
            ui.updateKeyboardForPentatonic();
        }
    });
    document.getElementById('toggle-pentatonic').addEventListener('change', e => {
        store.setPentatonicMode(e.target.checked);
        if (e.target.checked) ui.calculatePentatonicScale();
        ui.updateKeyboardForPentatonic();
    });

    // エフェクトトグル (シンプルなバージョン)
    document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        if(checkbox.id === 'toggle-pentatonic' || checkbox.id === 'toggle-pad-polyphony') return;
        if (checkbox.id.startsWith('pad-invert-')) return;

        checkbox.addEventListener('change', e => {
            document.getElementById(e.target.id.replace('toggle-', '') + '-controls').style.display = e.target.checked ? 'block' : 'none';
        });
    });

    // ... (randBtn, reset-pitch, keyboard, pads-container, drum-pads-container のリスナーは変更なし) ...
    document.getElementById("random").addEventListener("mousedown", () => {
        const randomNoteName = noteOrder[Math.floor(Math.random() * noteOrder.length)];
        audioEngine.startTone(freqs[randomNoteName]);
        randomOsc = { freq: freqs[randomNoteName] };
    });
    document.getElementById("random").addEventListener("mouseup", () => { if (randomOsc) audioEngine.stopTone(randomOsc.freq); });
    document.getElementById("random").addEventListener("mouseleave", () => { if (randomOsc) audioEngine.stopTone(randomOsc.freq); });
    document.getElementById('reset-pitch').addEventListener('click', () => {
        audioEngine.updatePitchShift(0);
    });
    document.getElementById("keyboard").addEventListener("mousedown", e => {
        const keyElement = e.target.closest('.key');
        if (keyElement && keyElement.dataset.note) {
            audioEngine.startTone(freqs[keyElement.dataset.note]);
        }
    });
    document.getElementById("keyboard").addEventListener("mouseup", e => {
        const keyElement = e.target.closest('.key');
        if (keyElement && keyElement.dataset.note) {
            audioEngine.stopTone(freqs[keyElement.dataset.note]);
        }
    });
    document.getElementById("keyboard").addEventListener("mouseleave", e => {
        const keyElement = e.target.closest('.key');
        if (keyElement && keyElement.dataset.note) {
            audioEngine.stopTone(freqs[keyElement.dataset.note]);
        }
    });
    document.getElementById("pads-container").addEventListener("click", e => {
        const padElement = e.target.closest('.sample-pad');
        if (padElement && padElement.dataset.index) {
            audioEngine.playUploaded(parseInt(padElement.dataset.index, 10));
        }
    });
    document.getElementById("drum-pads-container").addEventListener("mousedown", e => {
        const padElement = e.target.closest('.drum-pad');
        if (padElement && padElement.dataset.sound) {
            drumMachine.playSound(padElement.dataset.sound);
        }
    });
}