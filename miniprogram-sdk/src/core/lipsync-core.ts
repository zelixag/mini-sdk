/**
 * Lipsync Core（平台无关）
 * 目标：与 Web SDK 的 blendshape_map 处理思路对齐，供小程序/其他端复用。
 */

export function mapBlendshapeGroups(
  bsw: number[],
  blendshapeMap?: number[][]
): number[][] {
  if (!Array.isArray(blendshapeMap) || blendshapeMap.length === 0) {
    return [bsw.slice()];
  }
  const groups: number[][] = [];
  for (let i = 0; i < blendshapeMap.length; i++) {
    const mapItem = blendshapeMap[i] || [];
    const group: number[] = [];
    for (let j = 0; j < mapItem.length; j++) {
      const srcIdx = mapItem[j];
      group[j] = bsw[srcIdx] ?? 0;
    }
    groups[i] = group;
  }
  return groups;
}

export function collectPositive(values: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (Number.isFinite(v) && v > 0) out.push(v);
  }
  return out;
}

export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p)));
  return sorted[idx];
}

export function clamp01(v: number): number {
  if (v <= 0) return 0;
  if (v >= 1) return 1;
  return v;
}

