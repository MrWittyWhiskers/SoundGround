export function applyDelay(audioCtx, inputNode, helpers) {
  const time = helpers.getNoteDurationInSeconds(document.getElementById("delay-time").value);
  const feedbackAmount = parseFloat(document.getElementById("delay-feedback").value);
  const mix = parseFloat(document.getElementById("delay-mix").value);

  const outputNode = audioCtx.createGain();
  const dryGain = audioCtx.createGain();
  const wetGain = audioCtx.createGain();
  const delayNode = audioCtx.createDelay(time * 2); // 最大ディレイタイム
  const feedbackNode = audioCtx.createGain();

  delayNode.delayTime.value = time;
  feedbackNode.gain.value = feedbackAmount;
  dryGain.gain.value = 1 - mix;
  wetGain.gain.value = mix;

  // Dry
  inputNode.connect(dryGain);
  dryGain.connect(outputNode);
  
  // Wet (Feedback Loop)
  inputNode.connect(delayNode);
  delayNode.connect(feedbackNode);
  feedbackNode.connect(delayNode); // フィードバック
  delayNode.connect(wetGain);
  wetGain.connect(outputNode);
  
  // クリーンアップは不要 (LFOなどを使っていないため)
  return { outputNode, cleanup: null };
}