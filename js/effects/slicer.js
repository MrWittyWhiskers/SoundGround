export function applySlicer(audioCtx, inputNode, helpers) {
    const noteValue = document.getElementById("slicer-rate").value;
    const mix = parseFloat(document.getElementById("slicer-mix").value);
    const rateInMs = helpers.getNoteDurationInSeconds(noteValue) * 1000 / 2;
    const slicerGain = audioCtx.createGain();
    const outputNode = audioCtx.createGain();
    const dryGain = audioCtx.createGain();
    dryGain.gain.value = 1 - mix;
    inputNode.connect(dryGain);
    dryGain.connect(outputNode);
    const wetGain = audioCtx.createGain();
    wetGain.gain.value = mix;
    inputNode.connect(slicerGain);
    slicerGain.connect(wetGain);
    wetGain.connect(outputNode);
    let muted = false;
    const interval = setInterval(() => {
        muted = !muted;
        slicerGain.gain.value = muted ? 0 : 1;
    }, rateInMs);
    const cleanup = () => clearInterval(interval);
    return { outputNode, cleanup };
}