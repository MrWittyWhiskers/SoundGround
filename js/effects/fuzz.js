/**
 * ファズエフェクト（Big Muff型トーンスタック）を適用します。
 * ゲインを限界までブーストし、激しく歪ませます。
 */
export function applyFuzz(audioCtx, inputNode) {
    const outputNode = audioCtx.createGain();

    // 1. スライダーの「現在の値」を取得
    const gainSlider = document.getElementById("fuzz-gain");
    const toneSlider = document.getElementById("fuzz-tone");
    const mixSlider = document.getElementById("fuzz-mix");
    
    const gain = parseFloat(gainSlider ? gainSlider.value : 10);
    const tone = parseFloat(toneSlider ? toneSlider.value : 0.5);
    const mix = parseFloat(mixSlider ? mixSlider.value : 1.0);

    /**
     * ハード・クリッピング（波形を切り落とす）カーブを生成
     */
    function makeHardClipCurve(clipLevel = 0.98) {
        const n_samples = 44100;
        const curve = new Float32Array(n_samples);
        for (let i = 0; i < n_samples; ++i) {
            const x = (i * 2 / n_samples) - 1;
            curve[i] = Math.max(-clipLevel, Math.min(clipLevel, x));
        }
        return curve;
    }

    // --- ノードの作成 ---

    // 0. 内部プリアンプ (1段目ブースト)
    const preGain = audioCtx.createGain();
    preGain.gain.value = 100.0; // 100倍

    // 1. 入力ゲイン (2段目ブースト - スライダー)
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = gain; // スライダーで最大100倍

    // 2. WaveShaper (1段目クリップ)
    const shaperNode1 = audioCtx.createWaveShaper();
    shaperNode1.curve = makeHardClipCurve(0.98);
    shaperNode1.oversample = 'none';

    // 3. 中間ゲイン (3段目ブースト)
    const interGain1 = audioCtx.createGain();
    interGain1.gain.value = 50.0; // 50倍

    // 4. WaveShaper (2段目クリップ)
    const shaperNode2 = audioCtx.createWaveShaper();
    shaperNode2.curve = makeHardClipCurve(0.98);
    shaperNode2.oversample = 'none';
    
    // 5. 中間ゲイン (4段目ブースト)
    const interGain2 = audioCtx.createGain();
    interGain2.gain.value = 50.0; // 50倍

    // 6. WaveShaper (3段目クリップ)
    const shaperNode3 = audioCtx.createWaveShaper();
    shaperNode3.curve = makeHardClipCurve(0.98);
    shaperNode3.oversample = 'none';

    // 7. 最終ゲイン (音量調整)
    const makeupGain = audioCtx.createGain();
    makeupGain.gain.value = 10.0; // 最終音量を 10倍

    // 8. トーン回路 (シーソー)
    const lowPassFilter = audioCtx.createBiquadFilter();
    lowPassFilter.type = 'lowpass';
    lowPassFilter.frequency.value = 800;
    const highPassFilter = audioCtx.createBiquadFilter();
    highPassFilter.type = 'highpass';
    highPassFilter.frequency.value = 1000;
    const lowPassGain = audioCtx.createGain();
    const highPassGain = audioCtx.createGain();
    lowPassGain.gain.value = 1.0 - tone;
    highPassGain.gain.value = tone;

    // 9. ミックス
    const dryGain = audioCtx.createGain();
    const wetGain = audioCtx.createGain();
    dryGain.gain.value = 1.0 - mix;
    wetGain.gain.value = mix;

    // --- 接続 ---
    // ドライ音
    inputNode.connect(dryGain);
    dryGain.connect(outputNode);

    // ウェット音 (ファズ)
    inputNode.connect(preGain);
    preGain.connect(gainNode);
    gainNode.connect(shaperNode1);
    shaperNode1.connect(interGain1);
    interGain1.connect(shaperNode2);
    shaperNode2.connect(interGain2);
    interGain2.connect(shaperNode3);
    shaperNode3.connect(makeupGain);
    
    makeupGain.connect(lowPassFilter);
    makeupGain.connect(highPassFilter);

    lowPassFilter.connect(lowPassGain);
    highPassFilter.connect(highPassGain);
    lowPassGain.connect(wetGain);
    highPassGain.connect(wetGain);
    wetGain.connect(outputNode);
    
    const cleanup = () => {};
    
    return { 
        outputNode: outputNode,
        cleanup: cleanup
    };
}