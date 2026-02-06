export function applyFilter(audioCtx, inputNode) {
  const cutoff = parseFloat(document.getElementById("filter-cutoff").value);
  const resonance = parseFloat(document.getElementById("filter-resonance").value);
  // const type = document.getElementById("filter-type").value; // ご提供のJSでは未使用
  
  const filterNode = audioCtx.createBiquadFilter();
  filterNode.type = 'lowpass'; // HTMLと連携していませんが、JSの実装に合わせてlowpass固定
  filterNode.frequency.setValueAtTime(cutoff, audioCtx.currentTime);
  filterNode.Q.setValueAtTime(resonance, audioCtx.currentTime);
  inputNode.connect(filterNode);
  
  // ▼▼▼ 修正 ▼▼▼
  // main.js が BiquadFilterNode (outputNode) の frequency を直接 LFO に接続するため
  // outputNode は filterNode そのものである必要があります。
  return { outputNode: filterNode, cleanup: null };
}