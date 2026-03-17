/**
 * PCM 音频参数分析工具
 * 用于检测和分析 PCM 音频数据的基本参数
 */
export interface PCMAudioParams {
    sampleRate: number;
    channels: number;
    bitDepth: number;
    format: string;
    encoding: string;
    bytesPerSample: number;
    sampleCount?: number;
    duration?: number;
}
/**
 * 分析 PCM 音频数据的基本参数
 * @param pcmData PCM 音频数据（Uint8Array）
 * @param knownSampleRate 已知的采样率（可选，如果不提供则使用默认值 24000）
 * @returns PCM 音频参数
 */
export declare function analyzePCMParams(pcmData?: Uint8Array, knownSampleRate?: number): PCMAudioParams;
/**
 * 检测 PCM 数据的可能参数（通过分析数据特征）
 * 注意：这种方法只能提供推测，最准确的参数应该从服务器配置中获取
 * @param pcmData PCM 音频数据
 * @returns 检测到的参数（可能不准确）
 */
export declare function detectPCMParams(pcmData: Uint8Array): Partial<PCMAudioParams>;
/**
 * 格式化显示 PCM 参数
 * @param params PCM 音频参数
 * @returns 格式化的字符串
 */
export declare function formatPCMParams(params: PCMAudioParams): string;
/**
 * 从音频渲染器获取当前 PCM 配置
 * @param audioRenderer 音频渲染器实例
 * @returns PCM 音频参数
 */
export declare function getPCMParamsFromRenderer(audioRenderer: any): PCMAudioParams;
