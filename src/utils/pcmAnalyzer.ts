/**
 * PCM 音频参数分析工具
 * 用于检测和分析 PCM 音频数据的基本参数
 */

export interface PCMAudioParams {
  sampleRate: number;        // 采样率 (Hz)
  channels: number;          // 声道数 (1=单声道, 2=双声道)
  bitDepth: number;          // 位深度 (8, 16, 24, 32)
  format: string;            // 格式 (S16LE, S24LE, F32LE 等)
  encoding: string;          // 编码方式 (PCM)
  bytesPerSample: number;    // 每个采样点的字节数
  sampleCount?: number;      // 样本数量（如果提供了数据）
  duration?: number;         // 时长（秒）（如果提供了数据）
}

/**
 * 分析 PCM 音频数据的基本参数
 * @param pcmData PCM 音频数据（Uint8Array）
 * @param knownSampleRate 已知的采样率（可选，如果不提供则使用默认值 24000）
 * @returns PCM 音频参数
 */
export function analyzePCMParams(
  pcmData?: Uint8Array,
  knownSampleRate?: number
): PCMAudioParams {
  // 根据代码中的配置，PCM 音频使用固定参数
  const sampleRate = knownSampleRate || 24000;
  const channels = 1; // 单声道
  const bitDepth = 16; // 16位
  const format = 'S16LE'; // Signed 16-bit Little Endian
  const encoding = 'PCM'; // 未压缩的 PCM 编码
  const bytesPerSample = 2; // 16位 = 2字节/采样点

  let sampleCount: number | undefined;
  let duration: number | undefined;

  if (pcmData) {
    // 计算样本数量
    sampleCount = Math.floor(pcmData.length / bytesPerSample);
    // 计算时长（秒）
    duration = sampleCount / sampleRate;
  }

  return {
    sampleRate,
    channels,
    bitDepth,
    format,
    encoding,
    bytesPerSample,
    sampleCount,
    duration,
  };
}

/**
 * 检测 PCM 数据的可能参数（通过分析数据特征）
 * 注意：这种方法只能提供推测，最准确的参数应该从服务器配置中获取
 * @param pcmData PCM 音频数据
 * @returns 检测到的参数（可能不准确）
 */
export function detectPCMParams(pcmData: Uint8Array): Partial<PCMAudioParams> {
  const dataLength = pcmData.length;
  
  // 检测位深度和字节序
  // 由于数据是 16 位，每个样本占 2 字节
  const bytesPerSample = 2; // 根据代码，固定为 2 字节（16位）
  const bitDepth = 16;
  
  // 检测声道数（通过数据长度和样本对齐）
  // 如果数据长度是 2 的倍数，可能是单声道
  // 如果数据长度是 4 的倍数，可能是双声道
  let channels = 1;
  if (dataLength % 4 === 0) {
    // 可能是双声道（2 通道 × 2 字节 = 4 字节/样本）
    // 但根据代码，这里固定为单声道
    channels = 1;
  }
  
  // 尝试检测采样率（这个很难准确检测，只能推测）
  // 如果知道数据时长和样本数，可以反推采样率
  const sampleCount = Math.floor(dataLength / bytesPerSample);
  
  return {
    channels,
    bitDepth,
    format: 'S16LE', // 根据代码，固定为 S16LE
    encoding: 'PCM',
    bytesPerSample,
    sampleCount,
  };
}

/**
 * 格式化显示 PCM 参数
 * @param params PCM 音频参数
 * @returns 格式化的字符串
 */
export function formatPCMParams(params: PCMAudioParams): string {
  const parts = [
    `采样率: ${params.sampleRate} Hz`,
    `声道: ${params.channels === 1 ? '单声道 (Mono)' : `双声道 (Stereo, ${params.channels} channels)`}`,
    `位深度: ${params.bitDepth} bit`,
    `格式: ${params.format}`,
    `编码: ${params.encoding}`,
    `每样本字节数: ${params.bytesPerSample} bytes`,
  ];

  if (params.sampleCount !== undefined) {
    parts.push(`样本数: ${params.sampleCount.toLocaleString()}`);
  }

  if (params.duration !== undefined) {
    parts.push(`时长: ${params.duration.toFixed(3)} 秒 (${(params.duration * 1000).toFixed(0)} ms)`);
  }

  return parts.join('\n');
}

/**
 * 从音频渲染器获取当前 PCM 配置
 * @param audioRenderer 音频渲染器实例
 * @returns PCM 音频参数
 */
export function getPCMParamsFromRenderer(audioRenderer: any): PCMAudioParams {
  // 尝试从 AudioWorklet 或 Audio 播放器获取配置
  let sampleRate = 24000; // 默认值
  let channels = 1;
  let bitDepth = 16;
  let format = 'S16LE';
  let bytesPerSample = 2;

  // 检查 AudioWorklet
  if (audioRenderer?.audio?.audioCtx) {
    sampleRate = audioRenderer.audio.audioCtx.sampleRate || 24000;
  }

  // 检查旧的 Audio 播放器
  if (audioRenderer?.audio?.SAMPLE_RATE) {
    sampleRate = audioRenderer.audio.SAMPLE_RATE;
  }

  // 根据代码，PCM 音频固定使用这些参数
  return {
    sampleRate,
    channels,
    bitDepth,
    format,
    encoding: 'PCM',
    bytesPerSample,
  };
}

