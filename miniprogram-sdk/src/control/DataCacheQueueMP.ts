/**
 * DataCacheQueue 小程序版（熵减：单一数据源）
 *
 * 职责：body_data、face_data 的缓存与帧索引查询
 * 与主项目 DataCacheQueue 接口对齐，但无 VideoFrame/ImageBitmap 存储
 * （小程序侧由 BodyRendererMP 实时从 VideoDecoder.getFrameData 取帧）
 */

import type { IAlignedFaceFrameData, IRawBodyFrameData } from '../types/frame-data';

export class DataCacheQueueMP {
  /** body 块列表（按 sf 排序） */
  private bodyChunks: IRawBodyFrameData[] = [];
  /** 表情 match 队列 */
  private facialQueue: IAlignedFaceFrameData[] = [];
  /** 原始表情队列 */
  private realFacialQueue: IAlignedFaceFrameData[] = [];

  /** 更新 body 数据（合并、去重、排序） */
  updateBodyData(items: IRawBodyFrameData[]): void {
    if (!items?.length) return;
    const seen = new Set<string>();
    for (const b of this.bodyChunks) {
      seen.add(`${b.sf}-${b.ef}-${b.n}`);
    }
    for (const item of items) {
      const key = `${item.sf}-${item.ef}-${item.n}`;
      if (!seen.has(key)) {
        seen.add(key);
        this.bodyChunks.push(item);
      }
    }
    this.bodyChunks.sort((a, b) => a.sf - b.sf);
  }

  /** 根据帧索引查找 body 块 */
  findBodyChunk(frameIndex: number): IRawBodyFrameData | null {
    for (const chunk of this.bodyChunks) {
      if (frameIndex >= chunk.sf && frameIndex <= chunk.ef) return chunk;
    }
    return null;
  }

  /** 更新表情 match 队列 */
  updateFacial(data: IAlignedFaceFrameData[]): void {
    if (data?.length) this.facialQueue.push(...data);
  }

  /** 更新原始表情队列 */
  updateRealFacial(data: IAlignedFaceFrameData[]): void {
    if (data?.length) this.realFacialQueue.push(...data);
  }

  /** 获取 match 表情（frameIndex 在 [sf,ef] 内且 body_id 匹配） */
  getFaceData(frameIndex: number, bodyId: number): IAlignedFaceFrameData | null {
    for (let i = this.facialQueue.length - 1; i >= 0; i--) {
      const item = this.facialQueue[i];
      if (item.body_id === bodyId && frameIndex >= item.sf && frameIndex <= item.ef) return item;
    }
    return null;
  }

  /** 获取原始表情 */
  getRealFaceData(frameIndex: number, bodyId: number): IAlignedFaceFrameData | null {
    for (let i = this.realFacialQueue.length - 1; i >= 0; i--) {
      const item = this.realFacialQueue[i];
      if (item?.body_id === bodyId && frameIndex >= (item?.sf ?? 0) && frameIndex <= (item?.ef ?? 0)) {
        return item;
      }
    }
    return null;
  }

  /** 清理过期 face 数据（ef < frameIndex） */
  trimFaceDataBefore(frameIndex: number): void {
    this.facialQueue = this.facialQueue.filter((item) => item.ef >= frameIndex);
    this.realFacialQueue = this.realFacialQueue.filter((item) => (item?.ef ?? 0) >= frameIndex);
  }

  get bodyQueue(): IRawBodyFrameData[] {
    return [...this.bodyChunks];
  }

  destroy(): void {
    this.bodyChunks = [];
    this.facialQueue = [];
    this.realFacialQueue = [];
  }
}
