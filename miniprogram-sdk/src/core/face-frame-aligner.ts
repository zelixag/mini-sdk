import type { IAlignedFaceFrameData, ITtsFaceFrameData } from '../types/frame-data';
import { mapBlendshapeGroups } from './lipsync-core';

function formatMJT(translate: number[] = [], rotate: number[] = []): any {
  // 小程序第一刀：保持同构数据结构，不引入 GLPipeline 强依赖类型
  return { translate, rotate };
}

export function alignFaceFrames(
  data: ITtsFaceFrameData[],
  blendshapeMap: number[][] = [],
  framedataProtoVersion: number | undefined = 2
): IAlignedFaceFrameData[] {
  return data.map((item) => {
    const { body_id, sf, ef, s: state, id, js = [], bsw = [], ms = [], face_frame_type } = item;
    const bswList = mapBlendshapeGroups(bsw, blendshapeMap);

    const mesh = Array.from({ length: ms.length }, (_, index) => {
      if (!framedataProtoVersion) {
        const legacy = ms[index] as any;
        return {
          blendshapeWeights: bswList[index] || [],
          textureModelIndex: legacy?.[0] ?? 0,
          texturePCAWeights: legacy?.[1] ?? [],
        };
      }
      const cur = ms[index] as any;
      return {
        blendshapeWeights: bswList[index] || [],
        textureModelIndex: cur?.index ?? 0,
        texturePCAWeights: cur?.weights ?? [],
      };
    });

    const movableJointTransforms = !framedataProtoVersion
      ? (js as any[]).map((joint) => formatMJT(joint?.[0], joint?.[1]))
      : (js as any[]).map((joint) => formatMJT(joint?.translate, joint?.rotate));

    return {
      body_id,
      frameIndex: sf,
      sf,
      ef,
      state,
      id,
      face_frame_type,
      FaceFrameData: {
        mesh,
        movableJointTransforms,
        // 直接用原始 bsw，不通过 blendshapeMap 映射（避免索引问题）
        blendshapeWeights: bsw,
      },
    };
  });
}

