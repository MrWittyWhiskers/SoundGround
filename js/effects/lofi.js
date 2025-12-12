export function applyLoFi(audioCtx, inputNode) {
  const muffleAmount = parseFloat(document.getElementById("lofi-muffle").value);
  const hissAmount = parseFloat(document.getElementById("lofi-hiss").value);
  const outputNode = audioCtx.createGain();
  let hissSource = null;
  const muffleFilter1 = audioCtx.createBiquadFilter();
  muffleFilter1.type = 'lowpass';
  muffleFilter1.frequency.value = muffleAmount;
  muffleFilter1.Q.value = 0.7;
  const muffleFilter2 = audioCtx.createBiquadFilter();
  muffleFilter2.type = 'lowpass';
  muffleFilter2.frequency.value = muffleAmount;
  muffleFilter2.Q.value = 0.7;
  const saturation = audioCtx.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = i * 2 / 256 - 1;
    curve[i] = Math.tanh(x * 2.5);
  }
  saturation.curve = curve;
  if (hissAmount > 0) {
    const bufferSize = audioCtx.sampleRate * 2;
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) { data[i] = Math.random() * 2 - 1; }
    hissSource = audioCtx.createBufferSource();
    hissSource.buffer = noiseBuffer;
    hissSource.loop = true;
    const hissGain = audioCtx.createGain();
    hissGain.gain.value = hissAmount;
    const hissFilter = audioCtx.createBiquadFilter();
    hissFilter.type = 'lowpass';
    hissFilter.frequency.value = 5000;
    hissSource.connect(hissFilter);
    hissFilter.connect(hissGain);
    hissGain.connect(outputNode);
    hissSource.start();
  }
  inputNode.connect(muffleFilter1);
  muffleFilter1.connect(muffleFilter2);
  muffleFilter2.connect(saturation);
  saturation.connect(outputNode);
  const cleanup = () => { if(hissSource) hissSource.stop(); };
  return { outputNode, cleanup };
}