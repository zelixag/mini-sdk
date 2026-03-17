// server.js
const fs = require('fs');
const WebSocket = require('ws');
const timestamp1 = require('./audio_with_ts/1_timestamp.json');
const timestamp2 = require('./audio_with_ts/2_timestamp.json');
const timestamp3 = require('./audio_with_ts/3_timestamp.json');

// @ts-ignore
const wss = new WebSocket.Server({
  port: 3000,
  verifyClient() {
    return true;
  }
});

const PCM_FILE_PATH = {
  segment_1: {
    paths: [
    ],
    wav: './audio_with_ts/1.wav',
    timestamps: timestamp1,
  },
  segment_2: {
    paths: [
    ],
    wav: './audio_with_ts/2.wav',
    timestamps: timestamp2,
  },
  segment_3: {
    paths: [
    ],
    wav: './audio_with_ts/3.wav',
    timestamps: timestamp3,
  },
}

const SAMPLE_RATE = 24000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;

/** 分片发送 pcm */
async function sendAudioStream1(ws, index) {
  const { paths, timestamps } = PCM_FILE_PATH[`segment_${index}`];

  let totalBytes = 0;
  for (const fullPath of paths) {
    const stats = fs.statSync(fullPath);
    totalBytes += stats.size;
  }

  const bytesPerSample = CHANNELS * (BITS_PER_SAMPLE / 8);
  const totalFrames = totalBytes / bytesPerSample;
  const bytesPerSecond = SAMPLE_RATE * CHANNELS * (BITS_PER_SAMPLE / 8);
  const milliseconds = (totalBytes / bytesPerSecond) * 1000;

  for (const fullPath of paths) {
    const readStream = fs.createReadStream(fullPath, { highWaterMark: 4096 });

    await new Promise((resolve, reject) => {
      readStream.on('data', (chunk) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(chunk, { binary: true });
        } else {
          readStream.destroy();
          resolve(true);
        }
      });

      readStream.on('end', () => {
        console.log(`[${Date.now()}] end sending: ${fullPath}`);
        resolve(true);
      });

      readStream.on('error', (err) => {
        console.error(`Error reading file: ${fullPath}`, err);
        reject(err);
      });
    });
  }

  if (ws.readyState === WebSocket.OPEN) {
    ws.send(`{"duration":${milliseconds},"timestamps":${JSON.stringify(timestamps)}}`);
    console.log(`[${Date.now()}] all send`);
  }

};

/** 合并 pcm 发送 */
async function sendAudioStream2(ws, index) {
  const { paths, timestamps } = PCM_FILE_PATH[`segment_${index}`];

  const buffers = paths.map((fullPath) => {
    const buf = fs.readFileSync(fullPath);
    console.log(`[${Date.now()}] loaded file: ${fullPath}`);
    return buf;
  });
  const mergedBuffer = Buffer.concat(buffers);
  const totalBytes = mergedBuffer.length;
  const bytesPerSecond = SAMPLE_RATE * CHANNELS * (BITS_PER_SAMPLE / 8);
  const milliseconds = (totalBytes / bytesPerSecond) * 1000;

  if (ws.readyState === WebSocket.OPEN) {
    ws.send(`{"duration":${milliseconds},"timestamps":${JSON.stringify(timestamps)}}`);
    console.log(`[${Date.now()}] all send`);
  }

  if (ws.readyState === WebSocket.OPEN) {
    ws.send(mergedBuffer, { binary: true });
    console.log(`[${Date.now()}] sent merged audio`);
  }
};

/** wav 发送 */
async function sendAudioStream3(ws, index) {
  const { wav, timestamps } = PCM_FILE_PATH[`segment_${index}`];

  const buffer = fs.readFileSync(wav);
  console.log(`[${Date.now()}] WAV file loaded: ${wav}`);

  if (ws.readyState === WebSocket.OPEN) {
    ws.send(`{"timestamps":${JSON.stringify(timestamps)}}`);
    console.log(`[${Date.now()}] all send`);
  }

  if (ws.readyState === WebSocket.OPEN) {
    ws.send(buffer, { binary: true });
    console.log(`[${Date.now()}] sent merged audio`);
  }
};

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', (message) => {
    const data = JSON.parse(message.toString());
    if (data.event !== 'start') {
      return
    }
    sendAudioStream3(ws, data.segment).catch(err => {
      console.error('Error during audio streaming:', err);
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

console.log('WebSocket server listening on port 3000');
