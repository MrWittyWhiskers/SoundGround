export function applyBitCrusher(audioCtx, inputNode) {
  const bitDepth = parseInt(document.getElementById("bitcrusher-depth").value);
  if (bitDepth >= 24) return { outputNode: inputNode, cleanup: null }; // 24bit以上はスルー
  const rateDivide = parseInt(document.getElementById("bitcrusher-rate").value);
  
  // createScriptProcessor は非推奨ですが、コードの意図を尊重します
  const processor = audioCtx.createScriptProcessor(4096, 1, 1);
  let step = Math.pow(2, bitDepth);
  let phaser = 0, lastSample = 0;
  processor.onaudioprocess = e => {
    const input = e.inputBuffer.getChannelData(0);
    const output = e.outputBuffer.getChannelData(0);
    for (let i = 0; i < 4096; i++) {
      phaser++;
      if (phaser >= rateDivide) {
        phaser = 0;
        lastSample = Math.round(input[i] * (step - 1)) / (step - 1);
      }
      output[i] = lastSample;
    }
  };
  inputNode.connect(processor);
  const outputNode = audioCtx.createGain();
  processor.connect(outputNode);
  
  // ▼▼▼ 修正 ▼▼▼
  const cleanup = () => {
    // 接続を解除してノードを破棄
    processor.disconnect(outputNode);
    inputNode.disconnect(processor);
  };
  return { outputNode, cleanup };
}