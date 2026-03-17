// PCM转WAV的辅助函数
export function pcmToWav(pcmData: Uint8Array) {
  const wavHeader = new ArrayBuffer(44);
  const view = new DataView(wavHeader);

  /* RIFF identifier */
  writeString(view, 0, "RIFF");
  /* RIFF chunk length */
  view.setUint32(4, 36 + pcmData.length, true);
  /* RIFF type */
  writeString(view, 8, "WAVE");
  /* format chunk identifier */
  writeString(view, 12, "fmt ");
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw) */
  view.setUint16(20, 1, true);
  /* channel count */
  view.setUint16(22, 1, true); // mono
  /* sample rate */
  view.setUint32(24, 24000, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, 24000 * 2, true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, 2, true);
  /* bits per sample */
  view.setUint16(34, 16, true);
  /* data chunk identifier */
  writeString(view, 36, "data");
  /* data chunk length */
  view.setUint32(40, pcmData.length, true);

  const wavData = new Uint8Array(wavHeader.byteLength + pcmData.length);
  wavData.set(new Uint8Array(wavHeader), 0);
  wavData.set(new Uint8Array(pcmData), wavHeader.byteLength);

  return wavData.buffer;
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
