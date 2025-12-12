export function applyFlanger(audioCtx, inputNode, helpers) {
  const noteValue = document.getElementById("flanger-rate").value;
  const depth = parseFloat(document.getElementById("flanger-depth").value);
  const mix = parseFloat(document.getElementById("flanger-mix").value);
  const rateInHz = helpers.getNoteFrequencyInHz(noteValue);
  const outputNode = audioCtx.createGain();
  const dryGain = audioCtx.createGain();
  dryGain.gain.value = 1 - mix;
  inputNode.connect(dryGain);
  dryGain.connect(outputNode);
  const wetGain = audioCtx.createGain();
  wetGain.gain.value = mix;
  const delay = audioCtx.createDelay(1);
  delay.delayTime.value = 0.005;
  const lfo = audioCtx.createOscillator();
  lfo.frequency.value = rateInHz;
  const lfoGain = audioCtx.createGain();
  lfoGain.gain.value = depth;
  lfo.connect(lfoGain);
  lfoGain.connect(delay.delayTime);
  lfo.start();
  inputNode.connect(delay);
  delay.connect(wetGain);
  wetGain.connect(outputNode);
  
  // ▼▼▼ 修正 ▼▼▼
  const cleanup = () => { lfo.stop(); };
  return { outputNode, cleanup };
}