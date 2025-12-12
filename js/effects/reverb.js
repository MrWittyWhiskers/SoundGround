// js/effects/reverb.js

export function applyReverb(audioCtx, inputNode) {
  const mix = parseFloat(document.getElementById("reverb-mix").value);
  const decay = parseFloat(document.getElementById("reverb-decay").value);
  const time = parseFloat(document.getElementById("reverb-time").value);

  const outputNode = audioCtx.createGain();
  const dryGain = audioCtx.createGain();
  const wetGain = audioCtx.createGain();
  
  dryGain.gain.value = 1 - mix;
  wetGain.gain.value = mix;

  // Dry (元の音)
  inputNode.connect(dryGain);
  dryGain.connect(outputNode);

  // --- Wet (リバーブ音) ---
  const preDelay = audioCtx.createDelay(0.5);
  preDelay.delayTime.value = 0.01;

  const feedbackGain = audioCtx.createGain();
  feedbackGain.gain.value = decay;

  const dampingFilter = audioCtx.createBiquadFilter();
  dampingFilter.type = 'lowpass';
  dampingFilter.frequency.value = 1500; // 高音域カットは維持

  // ▼▼▼ ここから追加 (ハウリング防止リミッター) ▼▼▼
  const limiter = audioCtx.createDynamicsCompressor();
  limiter.threshold.setValueAtTime(-3, audioCtx.currentTime); // -3dBを超えたら圧縮開始
  limiter.knee.setValueAtTime(0, audioCtx.currentTime);       // 0 (ハードなリミッター)
  limiter.ratio.setValueAtTime(20, audioCtx.currentTime);      // 20:1 (ほぼ完全に抑える)
  limiter.attack.setValueAtTime(0.001, audioCtx.currentTime);  // 非常に速く反応
  limiter.release.setValueAtTime(0.1, audioCtx.currentTime);   // すぐ解除
  // ▲▲▲ ここまで追加 ▲▲▲

  const delay1 = audioCtx.createDelay(1.0);
  delay1.delayTime.value = time * 0.043;
  const delay2 = audioCtx.createDelay(1.0);
  delay2.delayTime.value = time * 0.031;

  // 入力をWetパスへ
  inputNode.connect(preDelay);
  preDelay.connect(delay1);
  preDelay.connect(delay2);

  // ▼▼▼ フィードバック・ループの接続を修正 ▼▼▼
  delay1.connect(feedbackGain);
  delay2.connect(feedbackGain);
  
  // ゲイン -> フィルター -> リミッター の順で接続
  feedbackGain.connect(dampingFilter); 
  dampingFilter.connect(limiter);       // フィルター出力をリミッターへ
  
  // リミッターの出力をディレイに戻す
  limiter.connect(delay2);
  limiter.connect(delay1);
  // ▲▲▲ 修正ここまで ▲▲▲

  // Wet音をアウトプットへ (ループの外から取り出す)
  delay1.connect(wetGain);
  delay2.connect(wetGain);
  wetGain.connect(outputNode);

  return { outputNode, cleanup: null };
}