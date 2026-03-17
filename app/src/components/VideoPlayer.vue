<template>
  <div class="video-container" ref="containerRef">
    <video
      ref="videoRef"
      class="video-element"
      preload="auto"
      crossorigin="anonymous"
      :src="currentConfig.resource_pack.body_data_dir + currentVideo.n + '.mp4'"
      @loadedmetadata="onLoadedMetadata"
      @timeupdate="onTimeUpdate"
      @ended="onEnded"
    ></video>

    <WebGLVideoProcessor
      v-if="isReady"
      ref="webglRef"
      :width="videoWidth"
      :height="videoHeight"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import WebGLVideoProcessor from './WebGLVideoProcessor.vue'

const containerRef = ref(null)
const videoRef = ref(null)
const webglRef = ref(null)

const isReady = ref(false)
const videoWidth = ref(0)
const videoHeight = ref(0)
const duration = ref(0)
const fps = ref(0)
const currentTime = ref(0)
const videoSrc = '/src/assets/0.mp4'

const props = defineProps({
  currentVideo: {
    type: Object,
    required: true
  },
  currentConfig: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['loadedmetadata', 'timeupdate', 'ended'])

function onLoadedMetadata() {
  videoWidth.value = 1080, // force 1080
  videoHeight.value = 1920, // force 1920
  duration.value = videoRef.value.duration
  fps.value = 24
  isReady.value = true

  emit('loadedmetadata', {
    "width": videoWidth.value,
    "height": videoHeight.value,
    "frameCount": Math.round(duration.value * fps.value),
    "fps": fps.value
  })
}

function onTimeUpdate() {
  currentTime.value = Math.round(videoRef.value.currentTime * fps.value)
  emit('timeupdate', currentTime.value)
}

function onEnded() {
  emit('ended')
}

function play(play_status) {
  if(play_status)videoRef.value.play(); else videoRef.value.pause();
}

function seekTo(frame_index) {
  videoRef.value.currentTime = frame_index / fps.value
}

// Expose video element
function getVideo() {
  return videoRef.value
}

// Expose WebGL processor
function getWebGLProcessor() {
  return webglRef.value
}

defineExpose({ getVideo, getWebGLProcessor, play, seekTo })

</script>

<style scoped>
.video-container {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #707070;
}
.video-element {
  max-width: 100%;
  max-height: 100%;
  display: none;
}
</style>