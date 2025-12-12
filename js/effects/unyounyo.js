export function applyUnyouNyo(audioCtx, inputNode) {
  const pitch = parseFloat(document.getElementById("unyounyo-pitch").value);
  const mix = parseFloat(document.getElementById("unyounyo-mix").value);
  const outputNode = audioCtx.createGain();
  const dryGain = audioCtx.createGain();
  dryGain.gain.value = 1 - mix;
  inputNode.connect(dryGain);
  dryGain.connect(outputNode);
  const wetGain = audioCtx.createGain();
  wetGain.gain.value = mix;
  const delay = audioCtx.createDelay(0.5);
  delay.delayTime.value = 0.1;
  const feedback = audioCtx.createGain();
  feedback.gain.value = 0.75;
  const lfo = audioCtx.createOscillator();
  lfo.frequency.value = Math.abs(pitch - 1) * 10;
  const lfoGain = audioCtx.createGain();
  lfoGain.gain.value = 0.01;
  lfo.connect(lfoGain);
  lfoGain.connect(delay.delayTime);
  lfo.start();
  inputNode.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(wetGain);
  wetGain.connect(outputNode);
  
  // ▼▼▼ 修正 ▼▼▼
  const cleanup = () => { lfo.stop(); };
  return { outputNode, cleanup };
}