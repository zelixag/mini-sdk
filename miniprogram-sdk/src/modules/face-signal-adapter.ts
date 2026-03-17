import type { IAlignedFaceFrameData, ITtsFaceFrameData } from '../types/frame-data';
import { clamp01, collectPositive, mapBlendshapeGroups, percentile } from '../core/lipsync-core';

export interface MouthSignalFrame {
  mouthOpen: number;
  confidence: number;
  sourceType: 'match' | 'real' | 'none';
}

export interface FaceSignalAdapterOptions {
  blendshapeMap?: number[][];
}

const DEFAULT_MOUTH_INDICES = [44, 45, 8, 9, 10, 11, 12, 13];

export class FaceSignalAdapter {
  private mouthIndices: number[] = [...DEFAULT_MOUTH_INDICES];
  private blendshapeMap: number[][] = [];

  constructor(options?: FaceSignalAdapterOptions) {
    this.setBlendshapeMap(options?.blendshapeMap);
  }

  setBlendshapeMap(map?: number[][]): void {
    this.blendshapeMap = Array.isArray(map) ? map : [];
    if (!map?.length) {
      this.mouthIndices = [...DEFAULT_MOUTH_INDICES];
      return;
    }
    const picked = new Set<number>();
    // Web 侧 blendshape_map 通常 0 号是全量，1~n 是面部局部，优先取 1~n 作为嘴区候选
    for (let i = 1; i < map.length; i++) {
      const group = map[i] || [];
      for (const idx of group) {
        if (Number.isInteger(idx) && idx >= 0) picked.add(idx);
      }
    }
    // 若资源包未提供局部分组，回退默认嘴型索引
    this.mouthIndices = picked.size ? [...picked] : [...DEFAULT_MOUTH_INDICES];
  }

  extract(faceData: ITtsFaceFrameData | IAlignedFaceFrameData | null): MouthSignalFrame {
    const bsw = (faceData as IAlignedFaceFrameData)?.FaceFrameData?.blendshapeWeights
      || (faceData as ITtsFaceFrameData)?.bsw;
    if (!bsw?.length) {
      return { mouthOpen: 0, confidence: 0, sourceType: 'none' };
    }

    const sourceType: 'match' | 'real' = faceData?.face_frame_type ? 'real' : 'match';
    const grouped = mapBlendshapeGroups(bsw, this.blendshapeMap);
    // 与 Web 思路保持同构：优先使用局部分组（通常 group[1..n]），再回退默认索引
    const mouthCandidates = grouped.slice(1).flat();
    const mappedValues = collectPositive(mouthCandidates);
    if (mappedValues.length === 0) {
      for (const idx of this.mouthIndices) {
        const v = bsw[idx];
        if (typeof v === 'number' && Number.isFinite(v) && v > 0) mappedValues.push(v);
      }
    }

    let raw = 0;
    let confidence = 0.4;
    if (mappedValues.length > 0) {
      const mean = mappedValues.reduce((s, x) => s + x, 0) / mappedValues.length;
      const p75 = percentile(mappedValues, 0.75);
      const max = mappedValues.reduce((m, x) => (x > m ? x : m), 0);
      raw = max * 0.55 + p75 * 0.3 + mean * 0.15;
      confidence = mappedValues.length >= 3 ? 0.95 : 0.75;
    } else {
      // 回退：统计全量正值，避免映射缺失时嘴型彻底失效
      const positives = collectPositive(bsw);
      let maxPos = 0;
      let sumPos = 0;
      const cntPos = positives.length;
      for (let i = 0; i < positives.length; i++) {
        const v = positives[i];
        sumPos += v;
        if (v > maxPos) maxPos = v;
      }
      const meanPos = cntPos > 0 ? (sumPos / cntPos) : 0;
      raw = maxPos * 0.7 + meanPos * 0.3;
      confidence = cntPos > 0 ? 0.45 : 0.1;
    }

    // 经验归一：先扣噪声地板，再放大到可见范围
    const mouthOpen = clamp01((raw - 0.05) * 1.7);
    return { mouthOpen, confidence, sourceType };
  }
}

