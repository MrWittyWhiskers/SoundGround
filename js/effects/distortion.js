export function applyDistortion(audioCtx, inputNode) {
  const gain = parseFloat(document.getElementById("distortion-gain").value);
  const treble = parseFloat(document.getElementById("distortion-treble").value);
  const midFreq = parseFloat(document.getElementById("distortion-mid-freq").value);
  const midCut = parseFloat(document.getElementById("distortion-mid-cut").value);
  const gate = audioCtx.createDynamicsCompressor();
  gate.threshold.setValueAtTime(-50, audioCtx.currentTime);
  gate.knee.setValueAtTime(0, audioCtx.currentTime);
  gate.ratio.setValueAtTime(20, audioCtx.currentTime);
  gate.attack.setValueAtTime(0.005, audioCtx.currentTime);
  gate.release.setValueAtTime(0.1, audioCtx.currentTime);
  const preGain = audioCtx.createGain();
  preGain.gain.value = gain;
  const waveShaper = audioCtx.createWaveShaper();
  const curve = new Float32Array(44100);
  for (let i = 0; i < 44100; i++) {
    const x = i * 2 / 44100 - 1;
    curve[i] = Math.tanh(x * 3);
  }
  waveShaper.curve = curve;
  waveShaper.oversample = '4x';
  const midScoop = audioCtx.createBiquadFilter();
  midScoop.type = 'peaking';
  midScoop.frequency.value = midFreq;
  midScoop.Q.value = 1.5;
  midScoop.gain.value = midCut;
  const trebleControl = audioCtx.createBiquadFilter();
  trebleControl.type = 'highshelf';
  trebleControl.frequency.value = 3500;
  trebleControl.gain.value = treble;
  const outputNode = audioCtx.createGain();
  inputNode.connect(gate);
  gate.connect(preGain);
  preGain.connect(waveShaper);
  waveShaper.connect(midScoop);
  midScoop.connect(trebleControl);
  trebleControl.connect(outputNode);
  return { outputNode, cleanup: null };
}