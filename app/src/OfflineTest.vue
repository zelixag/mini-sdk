<template>
  <!-- 如果loading 为true, 则设置透明度0.5,且不可点击 -->
  <div class="offline-container">
    <div v-if="loading" class="loading" />
    <div v-if="error" class="error">
      {{ error }}
    </div>
    <div style="display: flex;">
      <Sidebar 
        :current-frame="videoCurrentFrame" 
        :frame-count="videoFrameCount"
        :fps="videoFPS"
        :playing="videoPlaying"
        @seek="onSeek"
        @set-playing="onSetPlaying"
        @download-texture="onDownloadTexture"
        @download-mesh="onDownloadMesh"
        @snapshot="onSnapshot"
        @manual-gl-context-lost="onManualGLContextLost"
        :gammaR="gammaR"
        @update:gammaR="onUpdateGammaR"
        :gammaG="gammaG"
        @update:gammaG="onUpdateGammaG"
        :gammaB="gammaB"
        @update:gammaB="onUpdateGammaB"
        :colorBalanceRC="colorBalanceRC"
        @update:colorBalanceRC="onUpdateColorBalanceRC"
        :colorBalanceGM="colorBalanceGM"
        @update:colorBalanceGM="onUpdateColorBalanceGM"
        :colorBalanceBY="colorBalanceBY"
        @update:colorBalanceBY="onUpdateColorBalanceBY"
        :current-video-index="currentVideoIndex"
        :total-videos="currentConfig.videoData.length"
        :current-video-name="currentVideo?.n || ''"
        :auto-play-next="autoPlayNext"
        :is-auto-playing="isAutoPlaying"
        @prev-video="onPrevVideo"
        @next-video="onNextVideo"
        @jump-to-video="onJumpToVideo"
        @toggle-auto-play="toggleAutoPlay"
        @pause-auto-play="pauseAutoPlay"
        @resume-auto-play="resumeAutoPlay"
      />
      <VideoPlayer
        v-if="currentVideo"
        ref="videoPlayerRef"
        :currentConfig="currentConfig"
        :currentVideo="currentVideo"
        @loadedmetadata="onLoadedMetadata"
        @timeupdate="onTimeUpdate"
        @ended="onEnded"
      />
      <img
        ref="bgTextureRef"
        :src="'./assets/bg_texture.png'"
        style="display: none;"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import Sidebar from './components/SideBar.vue'
import VideoPlayer from './components/VideoPlayer.vue'
import XmovAvatar from 'youling-lite';
import exampleConfig from './assets/avatarData.js'

const { IBRAnimationGeneratorCharInfo_NN, unpackIBRAnimation, getVertices, getWavefrontObjFromVertices, getPCATextures, formatMJT, GLPipeline } = XmovAvatar;
const videoPlayerRef = ref(null)
const bgTextureRef = ref(null)
const videoCurrentFrame = ref(0)
const videoFrameCount = ref(0)
const videoFPS = ref(60)
const videoPlaying = ref(false)
const gammaR = ref(1.0)
const gammaG = ref(1.0)
const gammaB = ref(1.0)
const loading = ref(true)
const error = ref('')

const colorBalanceRC = ref(0)
const colorBalanceGM = ref(0)
const colorBalanceBY = ref(0)
const firstLoad = ref(true)
// 当前使用的配置
const currentConfig = ref(exampleConfig)
// 视频数据相关
const currentVideoIndex = ref(0)
const currentVideo = ref(null)

// // 自动播放相关
const autoPlayNext = ref(false) // 自动播放下一个视频的开关
const isAutoPlaying = ref(false) // 是否正在自动播放模式

function setLoading(params) {
  loading.value = params
}
async function onLoadedMetadata(metadata) {
  videoFrameCount.value = metadata["frameCount"]
  videoFPS.value = metadata["fps"]
  if(firstLoad.value) {
    initializeApplication()
  }
}
function onTimeUpdate(frame_index) {
  videoCurrentFrame.value = frame_index
}
function onEnded() {
  videoCurrentFrame.value = 0
  videoPlaying.value = false
  
  // 如果启用了自动播放下一个视频，则自动切换
  if (autoPlayNext.value && currentVideoIndex.value < currentConfig.value.videoData.length - 1) {
    isAutoPlaying.value = true
    setTimeout(() => {
      onNextVideo()
      isAutoPlaying.value = false
    }, 1000) // 延迟1秒后播放下一个视频
  } else if (autoPlayNext.value && currentVideoIndex.value >= currentConfig.value.videoData.length - 1) {
    // 如果是最后一个视频，显示播放完成通知
    showPlaylistCompleteNotification()
    // 可选：自动关闭自动播放
    // autoPlayNext.value = false
  }
}
function onSeek(new_frame_index) {
  if (videoPlayerRef.value) {
    videoPlayerRef.value.seekTo(new_frame_index)
  }
}
function onSetPlaying(status) {
  if (videoPlayerRef.value) {
    videoPlayerRef.value.play(status)
    videoPlaying.value = status
  }
}

function onUpdateGammaR(value) {
  gammaR.value = value
  updateGammaInWebGL()
}

function onUpdateGammaG(value) {
  gammaG.value = value
  updateGammaInWebGL()
}

function onUpdateGammaB(value) {
  gammaB.value = value
  updateGammaInWebGL()
}

function onUpdateColorBalanceRC(value) {
  colorBalanceRC.value = value
  updateColorBalanceInWebGL()
}

function onUpdateColorBalanceGM(value) {
  colorBalanceGM.value = value
  updateColorBalanceInWebGL()
}

function onUpdateColorBalanceBY(value) {
  colorBalanceBY.value = value
  updateColorBalanceInWebGL()
}

let pipeline = null;

function updateGammaInWebGL() {
  if (pipeline) {
    pipeline.setGamma(gammaR.value, gammaG.value, gammaB.value);
    pipeline.device.refresh();
  }
}

function updateColorBalanceInWebGL() {
  if (pipeline) {
    pipeline.setColorBalance(colorBalanceRC.value, colorBalanceGM.value, colorBalanceBY.value);
    pipeline.device.refresh();
  }
}

function triggerDownload(data, MIMEType, filename){
  const blob = new Blob([data], { type: MIMEType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  // Append the anchor to the body (required for Firefox)
  document.body.appendChild(a);

  a.click();

  document.body.removeChild(a); 
  URL.revokeObjectURL(url);
}

async function triggerImgDownload(img_data, MIMEType, filename, flipY=false){
  const bitmap = await createImageBitmap(new ImageData(img_data.data, img_data.width, img_data.height), (flipY ? {imageOrientation: "flipY"} : undefined));
  const exportCanvas = new OffscreenCanvas(img_data.width, img_data.height);
  const ctx = exportCanvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  const blob = await exportCanvas.convertToBlob({type: MIMEType});
  const reader = new FileReader();
  reader.onloadend = function () {
    const a = document.createElement('a');
    a.href = reader.result;
    a.download = filename;
    a.style.display = 'none';
    // Append the anchor to the body (required for Firefox)
    document.body.appendChild(a);

    a.click();

    document.body.removeChild(a); 
    URL.revokeObjectURL(reader.result);
  };
  // Read the Blob as a Data URL
  reader.readAsDataURL(blob);
}

let cbCapture = null;
let cbSnapshot = null;

async function onDownloadTexture() {
  let captureTask = new Promise((succ, fail) => { cbCapture = succ; });
  pipeline.device.refresh();
  let captureResult = await captureTask;
  for(let i = 0;i<captureResult["texture"].length;i++)await triggerImgDownload(captureResult["texture"][i], "image/png", `texExport${i}.png`);
}

async function onDownloadMesh() {
  let captureTask = new Promise((succ, fail) => { cbCapture = succ; });
  pipeline.device.refresh();
  let captureResult = await captureTask;
  triggerDownload(captureResult["mesh"], "model/obj", "faceExport.obj");
}

async function onSnapshot() {
  let snapshotTask = new Promise((succ, fail) => { cbSnapshot = succ; });
  pipeline.device.refresh();
  let captureResult = await snapshotTask;
  const bitmap = new ImageData(captureResult.data, captureResult.width, captureResult.height);
  await triggerImgDownload(bitmap, "image/png", "snapshot.png", true);
}

async function onManualGLContextLost(){
  pipeline.device.simulateContextFault(false);
  await new Promise(succ => setTimeout(succ, 1000));
  pipeline.device.simulateContextFault(true);
}

// 加载配置数据的函数
async function loadConfigData(config) {
  let static_info = null;
  let char_info = null;
  let animation_info = null;
  let res = null;

  try {
    // 加载角色数据
    res = await fetch(config.resource_pack.face_ani_char_data);
    if (res.ok) {
      let char_data = await res.arrayBuffer();
      char_info = new IBRAnimationGeneratorCharInfo_NN(char_data,
        {
          blendshapeMap: config.resource_pack.blendshape_map 
        }
      );
    } else {
      throw new Error(`Failed to load char data: ${res.status}`);
    }

    // 加载动画数据
    if (config.faceData && config.faceData.length > 0) {
        animation_info = config.faceData;
    }
    if (config.render_faceData && config.render_faceData.length > 0) {
        animation_info = config.render_faceData;
    }
    return { char_info, animation_info };
  } catch (error) {
    console.error("Error loading config data:", error);
    throw error;
  }
}



async function initializeApplication() {
  try {
    // 加载配置数据
    const { char_info, animation_info } = await loadConfigData(currentConfig.value);
    const webglComponent = videoPlayerRef.value?.getWebGLProcessor();
    if (webglComponent) {
      const char_init_data = {
        char: char_info,
        LUT: null,
        transform:{
          offsetX: 0,
          offsetY: 0,
          scaleX: 1,
          scaleY: 1,
        },
        multisample: null
      }
      setLoading(false)

      if(typeof webglComponent.getDevice === 'function'){
        const device = webglComponent.getDevice();
        pipeline = new GLPipeline(device);

        pipeline.setCharData(char_init_data);
        pipeline.setFrameDataCallback(() => {
          const video = videoPlayerRef.value?.getVideo();
          const animation_data = animation_info.filter(item => item.body_id === currentVideo.value.body_id && item.sf >= currentVideo.value.sf && item.sf < currentVideo.value.ef);
          
          const currentFrame = Math.min(Math.round(video.currentTime * videoFPS.value), animation_data.length - 1);
          const frame_data = animation_data[currentFrame]?.FaceFrameData ?? null;
          if(frame_data) {
            for(let i = 0;i<frame_data.movableJointTransforms.length;i++){
              frame_data.movableJointTransforms[i] = formatMJT(frame_data.movableJointTransforms[i].translation, frame_data.movableJointTransforms[i].rotQuaternion);
            }
          }
          if(null !== cbCapture){
            
            const geometry = getVertices(char_init_data, frame_data);
            const wavefrontObj = getWavefrontObjFromVertices(char_init_data, geometry);
            const textures = getPCATextures(char_init_data, frame_data);
            cbCapture({
              "mesh": wavefrontObj,
              "texture": textures,
              "frame": device.captureFrame()
            });
            cbCapture = null;
          }
          return {
              backgroundTexture: null,
              charBodyTexture: video,
              data: frame_data,
              onPostRender: () => {
                if(cbSnapshot){
                  cbSnapshot(device.captureFrame());
                  cbSnapshot = null;
                }
              }
          };
        });
        pipeline.setSyncMedia();

        device.canvas.addEventListener("webglcontextlost", (event) => {
            console.log("Context lost.");
        }, false);
        device.canvas.addEventListener("webglcontextrestored", (event) => {
            pipeline.reinitialize();
            pipeline.setSyncMedia();
            console.log("Context restored.");
        }, false);
      }
    }else {
      console.error("Failed to initialize application: webglComponent not found");
    }
  } catch (error) {
    setLoading(false)
    console.error("Failed to initialize application:", error);
  }
}

// 视频切换功能
async function onPrevVideo() {
  if (currentVideoIndex.value > 0) {
    currentVideoIndex.value--;
    await switchVideo(currentVideoIndex.value);
  }
}

async function onNextVideo() {
  if (currentVideoIndex.value < currentConfig.value.videoData.length - 1) {
    currentVideoIndex.value++;
    await switchVideo(currentVideoIndex.value);
  }
}

async function onJumpToVideo(videoIndex) {
  if (videoIndex >= 0 && videoIndex < currentConfig.value.videoData.length) {
    currentVideoIndex.value = videoIndex;
    await switchVideo(currentVideoIndex.value);
  }
}

async function switchVideo(videoIndex) {
  try {
    // 停止当前视频
    if (videoPlayerRef.value) {
      videoPlayerRef.value.play(false);
    }
    
    // 更新当前视频
    currentVideo.value = currentConfig.value.videoData[videoIndex];
    
    // 重置视频状态
    videoCurrentFrame.value = 0;
    videoPlaying.value = false;
    
    // 显示切换通知
    showVideoSwitchNotification(videoIndex);
    
    // 如果是自动播放模式，延迟后自动开始播放
    if (isAutoPlaying.value) {
      setTimeout(() => {
        if (videoPlayerRef.value) {
          videoPlayerRef.value.play(true);
          videoPlaying.value = true;
        }
      }, 500); // 延迟500ms后开始播放
    }
    
    console.log(`Switched to video ${videoIndex}: ${currentVideo.value.n}`);
  } catch (error) {
    console.error(`Failed to switch to video ${videoIndex}:`, error);
  }
}

// 显示视频切换通知
function showVideoSwitchNotification(videoIndex) {
  // 创建通知元素
  const notification = document.createElement('div');
  notification.className = 'video-switch-notification';
  notification.textContent = `已切换到视频 ${videoIndex + 1}`;
  
  // 添加样式
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background-color: #007bff;
    color: white;
    padding: 10px 20px;
    border-radius: 5px;
    z-index: 1000;
    font-size: 14px;
    opacity: 0;
    transform: translateX(100%);
    transition: all 0.3s ease;
  `;
  
  document.body.appendChild(notification);
  
  // 显示动画
  setTimeout(() => {
    notification.style.opacity = '1';
    notification.style.transform = 'translateX(0)';
  }, 100);
  
  // 自动隐藏
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transform = 'translateX(100%)';
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 300);
  }, 2000);
}

// 显示播放完成通知
function showPlaylistCompleteNotification() {
  const notification = document.createElement('div');
  notification.className = 'playlist-complete-notification';
  notification.textContent = '播放完成！';
  
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background-color: #28a745;
    color: white;
    padding: 10px 20px;
    border-radius: 5px;
    z-index: 1000;
    font-size: 16px;
    opacity: 0;
    transition: opacity 0.3s ease;
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.opacity = '1';
  }, 100);
  
  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 300);
  }, 2000);
}

// 暂停自动播放
function pauseAutoPlay() {
  autoPlayNext.value = false
  isAutoPlaying.value = false
  console.log('自动播放已暂停')
}

// 恢复自动播放
function resumeAutoPlay() {
  autoPlayNext.value = true
  console.log('自动播放已恢复')
}

// 切换自动播放状态
function toggleAutoPlay() {
  autoPlayNext.value = !autoPlayNext.value
  if (autoPlayNext.value) {
    console.log('自动播放已开启')
    showAutoPlayStatusNotification('自动播放已开启', '#28a745')
  } else {
    console.log('自动播放已暂停')
    showAutoPlayStatusNotification('自动播放已暂停', '#dc3545')
  }
}

// 显示自动播放状态通知
function showAutoPlayStatusNotification(message, color) {
  const notification = document.createElement('div');
  notification.className = 'auto-play-status-notification';
  notification.textContent = message;
  
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background-color: ${color};
    color: white;
    padding: 8px 16px;
    border-radius: 5px;
    z-index: 1000;
    font-size: 14px;
    opacity: 0;
    transform: translateX(100%);
    transition: all 0.3s ease;
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.opacity = '1';
    notification.style.transform = 'translateX(0)';
  }, 100);
  
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transform = 'translateX(100%)';
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 300);
  }, 1500);
}

onMounted(() => {
  if (!currentConfig.value.videoData?.length) {
    loading.value = false
    error.value = '回放数据有误，无视频信息'
    return
  }
  currentVideo.value = currentConfig.value.videoData?.[currentVideoIndex.value]
  // 添加键盘事件监听
  document.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  // 移除键盘事件监听
  document.removeEventListener('keydown', handleKeydown)
})

// 键盘快捷键处理
function handleKeydown(event) {
  // 只有在没有输入框聚焦时才处理快捷键
  if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.tagName === 'SELECT') {
    return
  }
  
  switch(event.key) {
    case 'ArrowLeft':
      event.preventDefault()
      onPrevVideo()
      break
    case 'ArrowRight':
      event.preventDefault()
      onNextVideo()
      break
    case 'Home':
      event.preventDefault()
      onJumpToVideo(0)
      break
    case 'End':
      event.preventDefault()
      onJumpToVideo(currentConfig.value.videoData.length - 1)
      break
    case 'a':
    case 'A':
      event.preventDefault()
      toggleAutoPlay()
      break
    case 'p':
    case 'P':
      event.preventDefault()
      if (autoPlayNext.value) {
        pauseAutoPlay()
      } else {
        resumeAutoPlay()
      }
      break
  }
}
</script>

<style scoped>
.offline-container {
  display: flex;
  height: 100vh;
}
.loading {
  width: 100vw;
  height: 100vh;
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(255,255,255,.5);
}
.loading::before {
  content: '';
  width: 100px;
  height: 100px;
  background-color: #6366f1; /* 主题色 */
  border-radius: 50%;
  animation: pulse 1.5s ease-in-out infinite;
  display: block;
  margin: 400px auto;
}
@keyframes pulse {
  0% { transform: scale(0.8); opacity: 0.7; }
  50% { transform: scale(1.2); opacity: 1; }
  100% { transform: scale(0.8); opacity: 0.7; }
}
</style>