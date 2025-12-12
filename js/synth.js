// synth.js
import { applyDistortion } from './effects/distortion.js';
import { applyBitCrusher } from './effects/bitcrusher.js';
import { applyLoFi } from './effects/lofi.js';
import { applyFilter } from './effects/filter.js';
import { applySlicer } from './effects/slicer.js';
import { applyUnyouNyo } from './effects/unyounyo.js';
import { applyFlanger } from './effects/flanger.js';
import { applyDelay } from './effects/delay.js';

export class Synth {
  constructor() {
    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.audioCtx.createGain();
    this.masterGain.connect(this.audioCtx.destination);

    this.freqs = {
      '低いド': 130.81, '低いド#': 138.59, '低いレ': 146.83, '低いレ#': 155.56, '低いミ': 164.81, '低いファ': 174.61, '低いファ#': 185.00, '低いソ': 196.00, '低いソ#': 207.65, '低いラ': 220.00, '低いラ#': 233.08, '低いシ': 246.94,
      'ド': 261.63, 'ド#': 277.18, 'レ': 293.66, 'レ#': 311.13, 'ミ': 329.63, 'ファ': 349.23, 'ファ#': 369.99, 'ソ': 392.00, 'ソ#': 415.30, 'ラ': 440.00, 'ラ#': 466.16, 'シ': 493.88,
      '高いド': 523.25, '高いド#': 554.37, '高いレ': 587.33, '高いレ#': 622.25, '高いミ': 659.26
    };
    this.noteOrder = Object.keys(this.freqs);

    this.bpm = 120;
    this.sampleBuffers = new Array(9).fill(null);
    this.activeOscillators = {};
    this.isPentatonicMode = false;
    this.currentKey = 'ド';
    this.chromaticScale = ['ド', 'ド#', 'レ', 'レ#', 'ミ', 'ファ', 'ファ#', 'ソ', 'ソ#', 'ラ', 'ラ#', 'シ'];
    this.activePentatonicScale = [];

    // UI 要素参照（設定される）
    this.keyboardContainer = null;
    this.padsContainer = null;

    // 管理用
    this.masterGain.gain.value = 1;
    this.keyToNoteMap = {
      'a': 'ド', 'w': 'ド#', 's': 'レ', 'e': 'レ#', 'd': 'ミ', 'f': 'ファ', 't': 'ファ#', 'g': 'ソ', 'y': 'ソ#', 'h': 'ラ', 'u': 'ラ#', 'j': 'シ',
      'k': '高いド', 'o': '高いド#', 'l': '高いレ', 'p': '高いレ#', ';': '高いミ'
    };

    this.currentlyPressed = {};
  }

  // ------------------------
  // UI生成
  // ------------------------
  createKeyboard(containerId) {
    const keyboard = document.getElementById(containerId);
    if (!keyboard) return;
    this.keyboardContainer = keyboard;
    keyboard.innerHTML = ''; // 既存クリア

    const whiteKeyWidth = 45;
    let whiteKeyCount = 0;
    this.noteOrder.forEach(note => {
      const key = document.createElement("div");
      const isBlack = note.includes('#');
      key.className = isBlack ? 'key black' : 'key white';
      const keyMapping = Object.fromEntries(Object.entries(this.keyToNoteMap).map(([k, v]) => [v, k]))[note] || '';
      key.innerHTML = `<span>${note.replace('低い', '低').replace('高い', '高').replace('#', '♯')}</span><span class="key-mapping">${keyMapping.toUpperCase()}</span>`;
      key.dataset.note = note;

      key.addEventListener("mousedown", () => this.startTone(this.freqs[note]));
      key.addEventListener("mouseup", () => this.stopTone(this.freqs[note]));
      key.addEventListener("mouseleave", () => this.stopTone(this.freqs[note]));

      if (isBlack) {
        key.style.left = `${((whiteKeyCount - 1) * whiteKeyWidth) + (whiteKeyWidth / 2)}px`;
      } else {
        whiteKeyCount++;
      }
      keyboard.appendChild(key);
    });
  }

  createPads(containerId) {
    const pads = document.getElementById(containerId);
    if (!pads) return;
    this.padsContainer = pads;
    pads.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const pad = document.createElement('button');
      pad.classList.add('sample-pad');
      pad.textContent = i + 1;
      pad.dataset.index = i;
      pad.addEventListener('click', () => this.playUploaded(i));
      pads.appendChild(pad);
    }
    this.updatePadsUI();
  }

  updatePadsUI() {
    const loadedCount = this.sampleBuffers.filter(b => b !== null).length;
    const counter = document.getElementById('pad-counter');
    if (counter) counter.textContent = `${loadedCount}/9`;
    if (!this.padsContainer) return;
    this.padsContainer.querySelectorAll('.sample-pad').forEach((pad, i) => {
      if (this.sampleBuffers[i]) pad.classList.add('loaded');
      else pad.classList.remove('loaded');
    });
  }

  // ------------------------
  // 音価・周波数関数（元コードを移植）
  // ------------------------
  getNoteDurationInSeconds(noteString) {
    let isDotted = false, noteValue = noteString;
    if (typeof noteValue === 'string' && noteValue.endsWith('d')) {
      isDotted = true;
      noteValue = noteValue.slice(0, -1);
    }
    noteValue = parseFloat(noteValue);
    if (isNaN(noteValue) || this.bpm === 0) return 0;
    let duration = (60 / this.bpm) * (4 / noteValue);
    if (isDotted) duration *= 1.5;
    return duration;
  }
  getNoteFrequencyInHz(noteValue) {
    const duration = this.getNoteDurationInSeconds(noteValue);
    return duration > 0 ? 1 / duration : 0;
  }

  // ------------------------
  // ペンタ計算
  // ------------------------
  calculatePentatonicScale() {
    const rootIndex = this.chromaticScale.indexOf(this.currentKey);
    if (rootIndex === -1) { this.activePentatonicScale = [...this.chromaticScale]; return; }
    const intervals = [0, 2, 4, 7, 9];
    this.activePentatonicScale = intervals.map(interval => this.chromaticScale[(rootIndex + interval) % 12]);
  }
  isNoteInScale(noteName) {
    if (!this.isPentatonicMode) return true;
    if (!noteName) return false;
    const baseNote = noteName.replace(/低い|高い|#|♯/g, '');
    return this.activePentatonicScale.includes(baseNote);
  }
  updateKeyboardForPentatonic() {
    if (!this.keyboardContainer) return;
    this.keyboardContainer.querySelectorAll('.key').forEach(key => {
      if (this.isNoteInScale(key.dataset.note)) key.classList.remove('disabled'); else key.classList.add('disabled');
    });
  }
}
  // ------------------------
  // エフェクトチェーン構築（元ロジック）
