<template>
  <div class="main-container" :style="sdkContainerStyle">
    <div v-if="showTip" style="position: absolute;left: 50%;top: 50%;transform: translate(-50%,-50%);">loading:{{ sdkProgress }}%</div>
    <div id="sdk" style="height: 100%;position: absolute;aspect-ratio: 9/16;top: 0;right: 0;" :style="{transform: `translateX(${transformX}px)`}"></div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from "vue";
import XmovAvatar from "youling-lite";

let LiteSDK: XmovAvatar | null;

// SDK连接配置
const appId = ref("3b8f7000b8fd4b4b83dfc680600590b2");
const appSecret = ref("8b25a33d96684052a6a6e5cc604c2a94");
const gatewayServer = ref("https://test-ttsa-gateway-lite.xmov.ai/api/session");
const sdkProgress = ref(0);
const transformX = ref(0);

const showTip = computed(() => {
  return sdkProgress.value !== 100;
});

const sdkContainerStyle = computed(() => {
  return showTip.value ? {
    background: "rgba(0,0,0,0.6)",
  } : {}
});

const removeListener =  window.IPC.ipcReceive("start-walk-test", (e) => {
  // 接收到行走测试指令，do something
  console.log(e.timeGap, e.offsetX);
});
// 默认布局和行走配置
const defaultLayout = {
  "container": {
    "size": [1440, 810]
  },
  "avatar": {
    "v_align": "center",
    "h_align": "middle",
    "scale": 0.3, // 人物大小 = 分辨率 * scale
    "offset_x": 0,
    "offset_y": 0
  }
}

// 大于100px
const defaultWalkConfig = {
  "min_x_offset": -500,
  "max_x_offset": 500,
  "walk_points": {
    "A": -500,
    "B": -400,
    "C": -300,
    "D": -200,
    "E": -100,
    "F": 0,
    "G": 100,
    "H": 200,
    "I": 300,
    "J": 400,
    "K": 500
  },
  "init_point": 0
}

// 默认配置 - 从环境变量获取，如果没有则使用默认值
const defaultConfigBase = {
        "look_name": "FF008_6530_new",
        "tts_vcn_id": "XMOV_HN_TTS__4",
        "is_large_model": false,
        "sta_face_id": "F_CN02_yuxuan",
        "mp_service_id": "F_CN02_show52_walk_test",
        "framedata_proto_version": 2,
        "figure_name": "SCF25_001",
        "lite_drive_style": "lively",
        "background_img": "https://media.youyan.xyz/youyan/images/shot_layer_library/2D_background/ppt_train_02__2D_background.png",
        "frame_rate": 24,
        "optional_emotion": "",
        "init_events": [
        ],
        "auto_ka": true,
        "render_preset": "1080x1920_fullbody",
        "layout": defaultLayout,
        "walk_config": defaultWalkConfig
      }

const configJson = ref(JSON.stringify(defaultConfigBase, null, 2));
let is_speak_walk_start = false

function init() {
  const config = JSON.parse(configJson.value);
  LiteSDK = new XmovAvatar({
    containerId: "#sdk",
    appId: appId.value || "123",
    appSecret: appSecret.value || "123",
    gatewayServer:
      gatewayServer.value || "https://test-ttsa-gateway-lite.xmov.ai",
    config,
    headers: {
      'Authorization': '888jn',
    },
    hardwareAcceleration: "prefer-software",
    proxyWidget: {
      "widget_slideshow": (data: any) => {
        console.log("widget_slideshow", data);
      },
      "widget_video": (data: any) => {
        console.log("widget_video", data);
      },
      speak_walk_start: (data: any) => {
        window.IPC.ipcSend("speak_walk_start");
        is_speak_walk_start = true
      },
      set_character_canvas_offset: (offsetX: number) => {
        if (!is_speak_walk_start) {
          return
        }
        // offsetX = Math.round(offsetX)
        window.IPC.ipcSend("set-character-canvas-offset", {offsetX});
        // transformX.value = offsetX;
      },
      speak_walk_end: (data: any) => {
        is_speak_walk_start = false
        // window.IPC.ipcSend("speak_walk_end");
      },
    },
    // onWidgetEvent(event: any) {
    //   console.log("event", event);
    // 处理字幕显示逻辑
    // if (event.type === "subtitle_on") {
    //   isSubtitleVisible.value = true;
    //   subtitleText.value = event.text;
    // } else if (event.type === "subtitle_off") {
    //   isSubtitleVisible.value = false;
    //   subtitleText.value = "";
    // }
    // 需要将输出的数据显示在字幕位置。
    // 返回的结果{type: 'subtitle_on', text: '您提到的医院似乎在查询相关信息'}
    // },
    onNetworkInfo(networkInfo) {
      console.log("NetworkInfo:", networkInfo);
    },
    onStateChange(state) {
      console.log("SDK State Change:", state);
    },
    onStatusChange(status) {
      console.log("SDK Status Change:", status);
    },
    onStateRenderChange(state, duration) {
      console.log("SDK State Change Render:", state, duration);
    },
    onMessage(e) {
      console.log('[onMessage]', e);
    }
  });
  LiteSDK.init({
    onDownloadProgress: (progress: number) => {
      sdkProgress.value = progress;
      console.log("progress", progress);
      if (progress === 100) {
        // LiteSDK?.showDebugInfo();
        LiteSDK?.speak(`<speak>
    <ue4event>
        <type>walk</type>
        <data>
            <target>K</target>
        </data>
    </ue4event>
汉皇重色思倾国，御宇多年求不得。杨家有女初长成，养在深闺人未识。天生丽质难自弃，一朝选在君王侧。回眸一笑百媚生，六宫粉黛无颜色。
</speak>`, true, true)
      }
    },
  });
}

onMounted(() => {
  init();
});
onUnmounted(() => {
  LiteSDK?.destroy();
  removeListener()
});
</script>

<style scoped>
.main-container {
  width: 100vw;
  height: 100vh;
  position: relative;
  overflow: hidden;
  -webkit-app-region: drag;
}

</style>
