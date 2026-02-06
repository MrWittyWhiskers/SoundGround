// js/effects/reverb.js
// SoundGround-safe reverb (Convolver-based, no feedback loop)

function clamp(v, min, max) {
  v = Number(v);
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}

function buildImpulse(audioCtx, seconds, decay) {
  const sr = audioCtx.sampleRate;
  const length = Math.max(1, Math.floor(sr * seconds));
  const buffer = audioCtx.createBuffer(2, length, sr);

  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  for (let i = 0; i < length; i++) {
    const t = i / length;
    const env = Math.pow(1 - t, decay);
    left[i]  = (Math.random() * 2 - 1) * env;
    right[i] = (Math.random() * 2 - 1) * env;
  }

  return buffer;
}

export function applyReverb(audioCtx, inputNode) {
  // --- UI elements (from index.html) ---
  const mixEl   = document.getElementById("reverb-mix");
  const timeEl  = document.getElementById("reverb-time");
  const decayEl = document.getElementById("reverb-decay");

  // --- Initial values ---
  const mix   = clamp(mixEl?.value, 0, 1);
  const time  = clamp(timeEl?.value, 0.2, 6.0);
  const decay = clamp(decayEl?.value, 0, 1);

  // --- Nodes ---
  const outputNode = audioCtx.createGain();
  outputNode.gain.value = 0.9; // master headroom

  const dryGain = audioCtx.createGain();
  const wetGain = audioCtx.createGain();

  dryGain.gain.value = 1 - mix;
  wetGain.gain.value = mix;

  // Pre-delay (space without feedback)
  const preDelay = audioCtx.createDelay(0.5);
  preDelay.delayTime.value = 0.015;

  // Convolver = reverb core (safe)
  const convolver = audioCtx.createConvolver();
  convolver.buffer = buildImpulse(
    audioCtx,
    time,
    1 + decay * 7   // pleasant decay curve
  );

  // Tone shaping (prevents metallic ringing)
  const lowpass = audioCtx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 3500;

  const highpass = audioCtx.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 120;

  // --- Wiring ---
  // Dry
  inputNode.connect(dryGain);
  dryGain.connect(outputNode);

  // Wet
  inputNode.connect(preDelay);
  preDelay.connect(convolver);
  convolver.connect(lowpass);
  lowpass.connect(highpass);
  highpass.connect(wetGain);
  wetGain.connect(outputNode);

  // --- Live update from sliders ---
  function update() {
    const m = clamp(mixEl?.value, 0, 1);
    const t = clamp(timeEl?.value, 0.2, 6.0);
    const d = clamp(decayEl?.value, 0, 1);

    dryGain.gain.value = 1 - m;
    wetGain.gain.value = m;

    convolver.buffer = buildImpulse(
      audioCtx,
      t,
      1 + d * 7
    );
  }

  mixEl?.addEventListener("input", update);
  timeEl?.addEventListener("input", update);
  decayEl?.addEventListener("input", update);

  // --- Cleanup (critical for your app) ---
  function cleanup() {
    try {
      inputNode.disconnect(dryGain);
      inputNode.disconnect(preDelay);

      preDelay.disconnect();
      convolver.disconnect();
      lowpass.disconnect();
      highpass.disconnect();

      dryGain.disconnect();
      wetGain.disconnect();
      outputNode.disconnect();
    } catch {}
  }

  return { outputNode, update, cleanup };
}
