<template>
  <aside class="sidebar">
    <!-- 视频切换控制 -->
    <div class="video-controls">
      <h3>视频控制</h3>
      <div class="video-info">
        <span>当前视频: {{ currentVideoIndex + 1 }} / {{ totalVideos }}</span>
        <div class="video-name" v-if="currentVideoName">
          <small>{{ currentVideoName }}</small>
        </div>
      </div>
      <div class="video-buttons">
        <button 
          @click="$emit('prev-video')" 
          :disabled="currentVideoIndex <= 0"
          class="video-btn"
          title="快捷键: ←"
        >
          ← 上一个
        </button>
        <button 
          @click="$emit('next-video')" 
          :disabled="currentVideoIndex >= totalVideos - 1"
          class="video-btn"
          title="快捷键: →"
        >
          下一个 →
        </button>
      </div>
      <div class="video-jump">
        <label>快速跳转:</label>
        <select 
          :value="currentVideoIndex" 
          @change="$emit('jump-to-video', parseInt($event.target.value))"
          class="video-select"
        >
          <option 
            v-for="(video, index) in totalVideos" 
            :key="index" 
            :value="index"
          >
            视频 {{ index + 1 }}
          </option>
        </select>
      </div>
      <div class="shortcuts-hint">
        <small>快捷键: ← → 切换视频, Home/End 跳转到首尾, A 切换自动播放, P 暂停/恢复自动播放</small>
      </div>
      
      <!-- 自动播放控制 -->
      <div class="auto-play-controls">
        <div class="auto-play-toggle">
          <label>
            <input 
              type="checkbox" 
              :checked="autoPlayNext"
              @change="$emit('toggle-auto-play')"
            />
            自动播放下一个视频
          </label>
        </div>
        <div class="auto-play-status" v-if="isAutoPlaying">
          <small style="color: #007bff;">⏳ 正在自动播放下一个视频...</small>
        </div>
        <div class="auto-play-buttons" v-if="!autoPlayNext">
          <button 
            @click="$emit('resume-auto-play')"
            class="auto-play-btn"
            title="恢复自动播放"
          >
            恢复自动播放
          </button>
        </div>
      </div>
    </div>
    
    <hr class="divider">
    
    <!-- 原有的时间控制 -->
    <div>
      <label>Time: {{ formatTime(currentFrame) }} / {{ formatTime(frameCount) }}</label>
      <br/>
      <label>CurrentFrame: {{ currentFrame }}</label>
      <input
        type="range"
        min="0"
        :max="frameCount"
        :value="currentFrame"
        @input="$emit('seek', $event.target.value)"
      />
    </div>
    <br>
    <input type="checkbox" v-model="showFrameIndexRef">Show Frame Index</input>
    <br>
    <button @click="$emit('seek', Math.max(0, currentFrame - 1));$emit('set-playing', false);">&#x23EE;</button>
    <button @click="$emit('set-playing', !playing)">{{ playing ? "\u23F8" : "\u2BC8" }}</button>
    <button @click="$emit('seek', Math.min(frameCount, currentFrame + 1));$emit('set-playing', false);">&#x23ED;</button>
    <br>
    <span>Get:</span>
    <button @click="$emit('download-texture')">Texture</button>
    <button @click="$emit('download-mesh')">Mesh</button>
    <br>
    <button @click="$emit('snapshot')">Snap</button>
    <br>
    <span>Fault Sim:</span>
    <button @click="$emit('manual-gl-context-lost')">GL Context</button>
    <br>
    <div>
      <label>Gamma R: {{ gammaR.toFixed(2) }}</label>
      <input
        type="range"
        min="0.6"
        max="1.5"
        step="0.01"
        :value="gammaR"
        @input="$emit('update:gammaR', parseFloat($event.target.value))"
      />
    </div>
    <div>
      <label>Gamma G: {{ gammaG.toFixed(2) }}</label>
      <input
        type="range"
        min="0.6"
        max="1.5"
        step="0.01"
        :value="gammaG"
        @input="$emit('update:gammaG', parseFloat($event.target.value))"
      />
    </div>
    <div>
      <label>Gamma B: {{ gammaB.toFixed(2) }}</label>
      <input
        type="range"
        min="0.6"
        max="1.5"
        step="0.01"
        :value="gammaB"
        @input="$emit('update:gammaB', parseFloat($event.target.value))"
      />
    </div>
    <div>
      <label>Color Balance R/C: {{ colorBalanceRC.toFixed(0) }}</label>
      <input
        type="range"
        min="-100"
        max="100"
        step="1"
        :value="colorBalanceRC"
        @input="$emit('update:colorBalanceRC', parseFloat($event.target.value))"
      />
    </div>
    <div>
      <label>Color Balance G/M: {{ colorBalanceGM.toFixed(0) }}</label>
      <input
        type="range"
        min="-100"
        max="100"
        step="1"
        :value="colorBalanceGM"
        @input="$emit('update:colorBalanceGM', parseFloat($event.target.value))"
      />
    </div>
    <div>
      <label>Color Balance B/Y: {{ colorBalanceBY.toFixed(0) }}</label>
      <input
        type="range"
        min="-100"
        max="100"
        step="1"
        :value="colorBalanceBY"
        @input="$emit('update:colorBalanceBY', parseFloat($event.target.value))"
      />
    </div>
  </aside>
</template>

<script setup>
import { ref } from 'vue'
const props = defineProps({
  currentFrame: { type: Number, required: true },
  frameCount: { type: Number, required: true },
  fps: { type: Number, required: true },
  showFrameIndex: { type: Boolean, default: false },
  playing: { type: Boolean, default: false },
  gammaR: { type: Number, default: 1.0 },
  gammaG: { type: Number, default: 1.0 },
  gammaB: { type: Number, default: 1.0 },
  colorBalanceRC: { type: Number, default: 0 },
  colorBalanceGM: { type: Number, default: 0 },
  colorBalanceBY: { type: Number, default: 0 },
  // 新增的视频切换相关props
  currentVideoIndex: { type: Number, default: 0 },
  totalVideos: { type: Number, default: 1 },
  currentVideoName: { type: String, default: '' },
  autoPlayNext: { type: Boolean, default: false },
  isAutoPlaying: { type: Boolean, default: false }
})

const showFrameIndexRef = ref(props.showFrameIndex)

function formatTime(frame) {
  if (showFrameIndexRef.value) return `${frame}`;
  else {
    let seconds = frame / props.fps;
    const s = Math.floor(seconds % 60).toString().padStart(2, '0')
    const m = Math.floor((seconds / 60) % 60).toString().padStart(2, '0')
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0')
    return `${h}:${m}:${s}`
  }
}
</script>

<style scoped>
.sidebar {
  width: 250px;
  padding: 1rem;
  background-color: #f4f4f4;
  border-right: 1px solid #ccc;
}

.sidebar input[type="range"] {
  width: 100%;
}

/* 视频控制样式 */
.video-controls {
  margin-bottom: 1rem;
  padding: 1rem;
  background-color: #e8e8e8;
  border-radius: 8px;
  border: 1px solid #ddd;
}

.video-controls h3 {
  margin: 0 0 0.5rem 0;
  color: #333;
  font-size: 1.1rem;
}

.video-info {
  margin-bottom: 0.5rem;
  font-weight: bold;
  color: #555;
}

.video-name {
  margin-top: 0.25rem;
  font-size: 0.8rem;
  color: #777;
}

.video-buttons {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.video-btn {
  flex: 1;
  padding: 0.5rem;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: background-color 0.2s;
}

.video-btn:hover:not(:disabled) {
  background-color: #0056b3;
}

.video-btn:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}

.video-jump {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.video-jump label {
  font-weight: bold;
  color: #555;
  font-size: 0.9rem;
}

.video-select {
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  background-color: white;
  font-size: 0.9rem;
}

.shortcuts-hint {
  margin-top: 0.5rem;
  font-size: 0.8rem;
  color: #777;
  text-align: center;
}

.divider {
  margin: 1rem 0;
  border: none;
  border-top: 1px solid #ddd;
}

/* 自动播放控制样式 */
.auto-play-controls {
  margin-top: 1rem;
  padding: 0.75rem;
  background-color: #f0f0f0;
  border-radius: 6px;
  border: 1px solid #eee;
}

.auto-play-toggle {
  margin-bottom: 0.5rem;
  padding-left: 0.5rem;
}

.auto-play-toggle label {
  font-weight: bold;
  color: #333;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.auto-play-toggle input[type="checkbox"] {
  transform: scale(1.1);
}

.auto-play-status {
  margin-bottom: 0.5rem;
  text-align: center;
  font-size: 0.8rem;
  color: #555;
}

.auto-play-buttons {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
}

.auto-play-btn {
  padding: 0.4rem 0.8rem;
  background-color: #28a745;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
  transition: background-color 0.2s;
}

.auto-play-btn:hover {
  background-color: #218838;
}
</style>