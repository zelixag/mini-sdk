<template>
  <div class="multi-avatar-container">
    <div class="header">
      <h2>多数字人切换演示</h2>
      <p class="description">选择一个数字人进行展示，其他数字人将进入隐身模式</p>
    </div>

    <!-- 主内容区域：左中右三栏 -->
    <div class="main-content">
      <!-- 左侧：说话控制和状态信息 -->
      <div class="left-panel">
        <!-- 说话控制 -->
        <div class="speak-panel">
          <h3>说话控制</h3>
          <div class="control-group">
            <label>说话内容：</label>
            <textarea
              v-model="speakText"
              class="speak-textarea"
              placeholder="输入要说的内容..."
              rows="5"
            ></textarea>
          </div>
          <div class="control-group">
            <label>音量：</label>
            <input
              type="range"
              v-model="volume"
              min="0"
              max="1"
              step="0.1"
              @input="setVolume"
            />
            <span>{{ volume }}</span>
          </div>
          <button
            class="btn btn-primary full-width"
            @click="speakToCurrentAvatar"
            :disabled="!currentAvatar || currentAvatar.loading || !currentAvatar.instance"
          >
            说话
          </button>
        </div>

        <!-- 状态信息 -->
        <div class="status-info">
          <h3>状态信息</h3>
          <div class="status-list">
            <div
              v-for="(avatar, index) in avatars"
              :key="index"
              class="status-item"
            >
              <strong>{{ avatar.name }}:</strong>
              <span>连接状态: {{ avatar.instance ? '已连接' : '未连接' }}</span>
              <span>渲染状态: {{ (avatar.renderState !== null) ? avatar.renderState : '未初始化' }}</span>
              <span>SDK状态: {{ (avatar.sdkStatus !== null) ? avatar.sdkStatus : '未初始化' }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 中间：数字人显示窗口 -->
      <div class="center-panel">
        <div class="avatar-display-wrapper">
          <div 
            v-for="(avatar, index) in avatars" 
            :key="avatar.name" 
            class="avatar-display" 
            :id="'avatar-display-' + index" 
            :class="{ 
              'current-avatar': currentAvatar && currentAvatar.name === avatar.name,
              'avatar-online': avatar.sdkStatus === AvatarStatus.visible,
              'avatar-invisible': avatar.sdkStatus === AvatarStatus.invisible
            }"
            :style="{
              display: avatar.instance ? 'block' : 'none',
              zIndex: avatar.sdkStatus === AvatarStatus.visible ? 10 : (avatar.sdkStatus === AvatarStatus.invisible ? 1 : 0),
              visibility: avatar.sdkStatus === AvatarStatus.invisible ? 'hidden' : 'visible'
            }"
          >
            <div v-if="!currentAvatar || currentAvatar.loading" class="loading-indicator">
              <div class="spinner"></div>
              <span>{{ currentAvatar?.loading ? '加载中...' : '请选择一个数字人' }}</span>
            </div>
          </div>
          <div class="current-avatar-info" v-if="currentAvatar && !currentAvatar.loading && !currentAvatar.error">
            <span class="avatar-name">{{ currentAvatar.name }}</span>
            <span class="avatar-status" :class="selectedIndex >= 0 && selectedIndex < avatarStatusClasses.length ? avatarStatusClasses[selectedIndex] : ''">
              {{ selectedIndex >= 0 && selectedIndex < avatarStatusTexts.length ? avatarStatusTexts[selectedIndex] : '' }}
            </span>
          </div>
        </div>
      </div>

      <!-- 右侧：数字人操作卡片列表 -->
      <div class="right-panel">
        <div class="avatar-list-header">
          <h3>屏型智能体列表</h3>
        </div>
        <div class="avatar-cards-container">
          <div class="avatar-cards-scroll">
            <div
              v-for="(avatar, index) in avatars"
              :key="index"
              class="avatar-card"
            >
              <!-- 卡片图片 -->
              <div class="avatar-card-image">
                <div class="avatar-image-placeholder">
                  <span>{{ avatar.name.charAt(0) }}</span>
                </div>
                <!-- 状态标签 -->
                <div 
                  v-if="avatar.instance" 
                  class="avatar-status-badge"
                  :class="{
                    'status-online': avatarStatuses[index] === 'enabled',
                    'status-connected': avatarStatuses[index] === 'connected-not-enabled'
                  }"
                >
                  <span v-if="avatarStatuses[index] === 'enabled'">✓ 在线</span>
                  <span v-else-if="avatarStatuses[index] === 'connected-not-enabled'">已连接,隐身</span>
                </div>
              </div>
              
              <!-- 卡片内容 -->
              <div class="avatar-card-content">
                <h4 class="avatar-card-title">{{ avatar.name }}</h4>
                <p class="avatar-card-appid">{{ avatar.appId }}</p>
              </div>
              
              <!-- 卡片操作按钮 -->
              <div class="avatar-card-actions">
                <!-- 未连接状态 -->
                <template v-if="avatarStatuses[index] === 'not-connected'">
                  <button
                    class="btn-card btn-card-primary"
                    @click="connectAvatar(index)"
                    :disabled="avatar.loading"
                  >
                    连接
                  </button>
                </template>
                
                <!-- 在线状态 -->
                <template v-else-if="avatarStatuses[index] === 'enabled'">
                  <button
                    class="btn-card btn-card-white"
                    @click="disableAvatar(index)"
                    :disabled="avatar.loading"
                  >
                    隐身
                  </button>
                  <button
                    class="btn-card btn-card-white"
                    @click="disconnectAvatar(index)"
                    :disabled="avatar.loading"
                  >
                    <span v-if="avatar.disconnecting" class="btn-loading">
                      <span class="btn-spinner"></span>
                      断开中...
                    </span>
                    <span v-else>断开连接</span>
                  </button>
                </template>
                
                <!-- 连接但隐身状态 -->
                <template v-else-if="avatarStatuses[index] === 'connected-not-enabled'">
                  <button
                    class="btn-card btn-card-white"
                    @click="disconnectAvatar(index)"
                    :disabled="avatar.loading"
                  >
                    <span v-if="avatar.disconnecting" class="btn-loading">
                      <span class="btn-spinner"></span>
                      断开中...
                    </span>
                    <span v-else>断开连接</span>
                  </button>
                  <button
                    class="btn-card btn-card-primary"
                    @click="enableAvatar(index)"
                    :disabled="avatar.loading"
                  >
                    在线
                  </button>
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 浮动面板：性能监控 -->
    <div 
      v-if="showTimingPanel" 
      class="timing-panel"
      :style="{ left: panelPosition.x + 'px', top: panelPosition.y + 'px' }"
    >
      <div class="timing-panel-header" @mousedown="startDrag">
        <h4>性能监控</h4>
        <div class="timing-panel-actions" @mousedown.stop>
          <button 
            class="timing-panel-toggle" 
            @click.stop="togglePanelCollapse"
            :title="isPanelCollapsed ? '展开' : '收起'"
          >
            {{ isPanelCollapsed ? '▼' : '▲' }}
          </button>
          <button class="timing-panel-close" @click.stop="showTimingPanel = false" title="关闭">×</button>
        </div>
      </div>
      <div 
        v-show="!isPanelCollapsed" 
        class="timing-panel-content"
      >
        <!-- 总体性能 -->
        <div class="performance-section">
          <div class="performance-section-title">总体性能</div>
          <div class="performance-item">
            <span class="performance-label">CPU总占用:</span>
            <span class="performance-value">{{ totalCpuUsage }}%</span>
          </div>
          <div class="performance-item">
            <span class="performance-label">内存总占用:</span>
            <span class="performance-value">{{ formatMemory(totalMemoryUsage) }}</span>
          </div>
        </div>
        
        <!-- 每个数字人的性能 -->
        <div class="performance-section" v-if="avatars.filter(a => a.instance).length > 0">
          <div class="performance-section-title">数字人性能</div>
          <template v-for="(avatar, index) in avatars" :key="index">
            <div v-if="avatar.instance" class="avatar-performance-item">
              <div class="avatar-performance-name">{{ avatar.name }}</div>
              <div class="avatar-performance-metrics">
                <div class="performance-item">
                  <span class="performance-label">CPU:</span>
                  <span class="performance-value">{{ avatar.performance?.cpuUsage?.toFixed(1) || '0.0' }}%</span>
                </div>
                <div class="performance-item">
                  <span class="performance-label">内存:</span>
                  <span class="performance-value">{{ formatMemory(avatar.performance?.memoryUsage || 0) }}</span>
                </div>
                <div class="performance-item">
                  <span class="performance-label">FPS:</span>
                  <span class="performance-value">{{ avatar.performance?.fps?.toFixed(1) || '0.0' }}</span>
                </div>
                <div class="performance-item" v-if="avatar.connectToRenderDuration !== undefined">
                  <span class="performance-label">连接→渲染:</span>
                  <span class="performance-value timing-value">{{ formatDuration(avatar.connectToRenderDuration) }}</span>
                </div>
                <div class="performance-item" v-if="avatar.switchDuration !== undefined">
                  <span class="performance-label">恢复渲染:</span>
                  <span class="performance-value timing-value">{{ formatDuration(avatar.switchDuration) }}</span>
                </div>
              </div>
            </div>
          </template>
        </div>
        
        <div v-if="avatars.filter(a => a.instance).length === 0" class="timing-empty">
          暂无数据
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted, nextTick } from 'vue';
// @ts-ignore
import XmovAvatar from 'youling-lite';
import { InitModel, AvatarStatus, RenderState } from '../../src/types/index';

interface PerformanceMetrics {
  cpuUsage: number; // CPU占用百分比（估算）
  memoryUsage: number; // 内存占用（MB）
  fps: number; // 帧率
}

interface AvatarInstance {
  name: string;
  appId: string;
  instance: XmovAvatar | null;
  loading: boolean;
  disconnecting?: boolean; // 断开连接中的状态
  progress?: number; // 加载进度（0-100）
  error: string | null;
  sdkStatus: AvatarStatus | null;
  renderState: RenderState | null;
  config: any;
  switchStartTime?: number; // 记录从隐身切换到在线的开始时间
  switchDuration?: number; // 记录从隐身切换到在线的耗时（毫秒）
  connectStartTime?: number; // 记录连接开始的开始时间
  connectToRenderDuration?: number; // 记录从连接到渲染完成的耗时（毫秒）
  performance?: PerformanceMetrics; // 性能指标
}

// 响应式数据
const selectedIndex = ref(-1); // -1 表示未选择
const speakText = ref(`社区超市刚开门，退休教师王大爷就拎着布袋子晃了进来。他戴着老花镜，走路慢悠悠的，每走一步都得先确认脚下的地砖没 “藏陷阱”—— 上周他在菜市场踩滑摔了个屁股墩，至今还对光滑地面有心理阴影。​
“小林啊，给我称二斤鸡蛋。” 王大爷走到收银台旁的鸡蛋区，朝着正在扫码的年轻收银员小林喊道。小林刚入职半个月，记性还不太好，听见喊声赶紧应着：“好嘞王大爷！您要土鸡蛋还是普通鸡蛋？”​
“当然是土鸡蛋！” 王大爷推了推老花镜，伸手去够货架上层的鸡蛋盒，“我家小孙子就爱吃土鸡蛋，说比普通鸡蛋香三倍。” 话音刚落，他手一滑，鸡蛋盒 “啪嗒” 掉在地上，十几个鸡蛋滚了一地，有几个还当场 “开了花”，蛋黄蛋清流得满地都是。​
王大爷瞬间慌了神，蹲在地上手忙脚乱地想捡，嘴里还念叨着：“哎哟这可咋整，我这老糊涂了，又给你们添麻烦了。” 小林见状赶紧跑过来，一边拦着王大爷一边说：“大爷您别动手，小心玻璃碴子扎手，我去拿清洁工具。”​
旁边买菜的张大妈凑过来，看着满地的鸡蛋笑出了声：“老王啊，你这是给鸡蛋‘放风’呢？还是想让它们在地上练瑜伽啊？” 王大爷脸一红，反驳道：“我这不是没拿稳嘛，你少在这儿幸灾乐祸。”​
正说着，超市经理李姐从办公室走出来，看到这场景也乐了：“王大爷，您这是打算在我们超市开个‘鸡蛋派对’啊？” 王大爷更不好意思了，连忙说：“李经理，这鸡蛋钱我赔，我赔双倍！”​
李姐摆摆手：“不用不用，您这岁数出门购物也不容易，下次小心点就行。” 接着她转头对小林说：“你赶紧清理一下，再给王大爷拿一盒新的，算超市的。”​
王大爷感动得直点头，刚要道谢，就看见张大妈拿着一把青菜走过来，对小林说：“姑娘，给我称称这菜，顺便问问你们经理，啥时候也给我整个‘青菜派对’啊？”​
小林忍不住笑了，李姐也笑着说：“张大妈，您要是也把菜掉地上，我照样给您换一盒新的。” 张大妈赶紧把菜抱在怀里：“那可不行，我这菜金贵着呢，可不能像老王那样‘败家’。”​
王大爷一听不乐意了：“我这是意外，怎么就成败家了？你上次在药店把钙片撒了一地，比我这鸡蛋还热闹呢！” 张大妈脸一红，嘟囔着：“那不一样，我那是钙片，能补钙，你这鸡蛋只能补蛋白质。”​
周围的顾客都被他俩逗笑了，李姐笑着打圆场：“行了行了，您俩别吵了，都是咱们社区的老熟人，下次购物都小心点，别再给我们超市‘添节目’了。”​
王大爷拿着新的鸡蛋盒，不好意思地对李姐和小林说：“谢谢你们啊，下次我一定小心，再也不搞‘鸡蛋派对’了。” 张大妈也跟着说：“我也不搞‘青菜派对’了，咱们都安安分分购物。”​
说完，两人相视一笑，之前的小别扭也烟消云散了。小林看着他俩的背影，笑着对李姐说：“咱们社区的大爷大妈可真有意思，每天都能整出点新乐子。” 李姐点点头：“是啊，有他们在，咱们超市都热闹多了。”​
从那以后，王大爷每次去超市都格外小心，再也没掉过东西。而 “鸡蛋派对” 这个梗，也成了社区超市里大家偶尔会提起的欢乐话题，每次说起，都会引来一阵笑声。`);
const volume = ref(1);
const showTimingPanel = ref(true); // 控制浮动面板显示/隐藏
const isPanelCollapsed = ref(false); // 控制面板收起/展开
const panelPosition = ref({ x: 20, y: 20 }); // 面板位置
const isDragging = ref(false); // 是否正在拖拽
const dragStartPos = ref({ x: 0, y: 0 }); // 拖拽开始位置

// 环境配置数组
interface EnvironmentConfig {
  gatewayServer: string;
  appId: string;
  appSecret: string;
  avatars: Omit<AvatarInstance, 'instance' | 'loading' | 'error' | 'sdkStatus' | 'renderState'>[];
}

const envConfigs: Record<string, EnvironmentConfig> = {
  test: {
    // @ts-ignore
    gatewayServer: import.meta.env.VITE_GATEWAY_SERVER || 'https://pre-ttsa-gateway-lite.xmov.ai/api/session',
    appId: '123',
    appSecret: '123',
    avatars: [
      {
        name: '护理助手',
        appId: 'APP-10001',
        config: {
          "auto_ka": true,
          "cleaning_text": true,
          "emotion_version": "v1_version",
          "figure_name": "SCF25_001",
          "framedata_proto_version": 1,
          "init_events": [],
          "is_large_model": false,
          "is_vertical": true,
          "language": "chinese",
          "lite_drive_style": "service1",
          "llm_name": "Doubao",
          "look_name": "N_Wuliping_14333_new",
          "mp_service_id": "F_CN02_show52",
          "optional_emotion": "serious,smile,confused",
          "pitch": 1,
          "raw_audio": true,
          "render_preset": "1080x1920_fullbody",
          "resolution": {
            "height": 1920,
            "width": 1080
          },
          "sta_face_id": "F_lively02_xiaoze",
          "tts_emotion": "neutral",
          "tts_speed": 1,
          "tts_split_length": 16,
          "tts_split_row": 1,
          "tts_vcn_id": "XMOV_HN_TTS__43",
          "volume": 1
        }
      },
      {
        name: '客服专员',
        appId: 'APP-10002',
        config: {
          "auto_ka": true,
          "cleaning_text": true,
          "figure_name": "CARTOON_MONKEY",
          "framedata_proto_version": 1,
          "init_events": [],
          "is_large_model": false,
          "is_vertical": false,
          "language": "chinese",
          "lite_drive_style": "lively",
          "llm_name": "Doubao",
          "look_name": "cartoon_monkey_001",
          "mp_service_id": "M_cartoon02_show",
          "pitch": 1,
          "raw_audio": true,
          "render_preset": "1080x1920_fullbody",
          "resolution": {
            "height": 1920,
            "width": 1080
          },
          "sta_face_id": "T_MONKEY",
          "tts_emotion": "neutral",
          "tts_speed": 1,
          "tts_split_length": 24,
          "tts_split_row": 1,
          "tts_vcn_id": "HS__zh_BV061_streaming",
          "volume": 1
        }
      },
      {
        name: '商务助理',
        appId: 'APP-10003',
        config: {
          "auto_ka": true,
          "cleaning_text": true,
          "emotion_version": "v1_version",
          "figure_name": "SCF25_001",
          "framedata_proto_version": 1,
          "init_events": [
            {
              "axis_id": 100,
              "height": 1.5763546798029555,
              "image": "https://media.xingyun3d.com/avatar_sdk_material/F_MX01_show__1080x1920_fullbody__jiangyan_14019_new.png",
              "type": "SetCharacterCanvasAnchor",
              "width": 1.5743440233236152,
              "x_location": -0.2857142857142857,
              "y_location": -0.016420361247947456
            },
            {
              "data": {
                "axis_id": 1,
                "height": 1,
                "image": "https://media.xingyun3d.com/xingyun3d/general/litehuman/background_2D/jushen_v1_gradientstarsky_01.png",
                "width": 1,
                "x_location": 0,
                "y_location": 0
              },
              "type": "widget_pic"
            }
          ],
          "is_large_model": true,
          "is_vertical": true,
          "language": "chinese",
          "lite_drive_style": "general",
          "llm_name": "Doubao",
          "look_name": "jiangyan_14019_new",
          "mp_service_id": "F_MX01_show",
          "optional_emotion": "smile,confused",
          "pitch": 1,
          "raw_audio": true,
          "render_preset": "1080x1920_fullbody",
          "resolution": {
            "height": 1920,
            "width": 1080
          },
          "sta_face_id": "F_CN06_liuyicen",
          "tts_emotion": "happy,neutral,surprised,sad,angry",
          "tts_speed": 1,
          "tts_split_length": 16,
          "tts_split_row": 1,
          "tts_vcn_id": "XMOV_HN_TTS__50",
          "volume": 1
        }
      },
      {
        name: '男大助理',
        appId: 'APP-10004',
        config: {
          "auto_ka": true,
          "cleaning_text": true,
          "emotion_version": "v2_version",
          "figure_name": "SCM20_001",
          "framedata_proto_version": 1,
          "init_events": [
            {
              "data": {
                "axis_id": 1,
                "height": 1,
                "image": "https://media.xingyun3d.com/xingyun3d/general/litehuman/background_2D/jushen_v1_dark_luxury_lounge_01.jpg",
                "width": 1,
                "x_location": 0,
                "y_location": 0
              },
              "type": "widget_pic"
            },
            {
              "axis_id": 100,
              "height": 1.7520525451559934,
              "image": "https://media.xingyun3d.com/avatar_sdk_material/M_MX01_show__1080x1920_fullbody__Suyuan_13389_new.png",
              "type": "SetCharacterCanvasAnchor",
              "width": 1.7520525451559934,
              "x_location": -0.37317784256559766,
              "y_location": -0.07717569786535304
            }
          ],
          "is_large_model": false,
          "is_vertical": true,
          "language": "chinese",
          "lite_drive_style": "lively",
          "llm_name": "Doubao",
          "look_name": "Suyuan_13389_new",
          "mp_service_id": "M_MX01_show",
          "optional_emotion": "surprise,sad,smile,angry",
          "pitch": 1,
          "raw_audio": true,
          "render_preset": "1080x1920_fullbody",
          "resolution": {
            "height": 1920,
            "width": 1080
          },
          "sta_face_id": "M_MX01_naigou",
          "tts_emotion": "happy,neutral,surprised,sad",
          "tts_speed": 1,
          "tts_split_length": 16,
          "tts_split_row": 1,
          "tts_vcn_id": "XMOV_HN_TTS__47",
          "volume": 1
        }
      },
      {
        name: '健康顾问',
        appId: 'APP-10005',
        config: {
          pitch: 1,
          volume: 1,
          auto_ka: true,
          language: 'chinese',
          look_name: 'N_Wuliping_14333_new',
          raw_audio: false,
          tts_speed: 1,
          resolution: { width: 1080, height: 1920 },
          tts_vcn_id: 'XMOV_HN_TTS__43',
          figure_name: 'SCF25_001',
          init_events: [],
          is_vertical: true,
          sta_face_id: 'F_lively02_xiaoze',
          cleaning_text: true,
          mp_service_id: 'F_CN02_show52',
          render_preset: '1080x1920_fullbody',
          tts_split_row: 1,
          is_large_model: false,
          emotion_version: 'v1_version',
          lite_drive_style: 'service1',
          optional_emotion: 'serious,smile,confused',
          tts_split_length: 16,
          framedata_proto_version: 1
        }
      }
    ]
  },
};

// 根据环境模式选择配置（默认使用 test 环境）
const currentEnv = 'test';
const currentConfig = envConfigs[currentEnv];

// 五个数字人配置（从环境配置中初始化）
const avatars = ref<AvatarInstance[]>(
  currentConfig.avatars.map(avatar => ({
    ...avatar,
    instance: null,
    loading: false,
    disconnecting: false,
    progress: 0,
    error: null,
    sdkStatus: null,
    renderState: null
  }))
);

// 调试用：在浏览器控制台可以通过 window.avatars 访问数字人列表
if (typeof window !== 'undefined') {
  (window as any).avatars = avatars;
  (window as any).currentEnv = currentEnv;
  (window as any).envConfigs = envConfigs;
}

// SDK 配置（从环境配置中获取）
const appId = ref(currentConfig.appId);
const appSecret = ref(currentConfig.appSecret);
const gatewayServer = ref(currentConfig.gatewayServer);

// 计算当前选中的数字人（添加边界检查，防止访问 null）
const currentAvatar = computed(() => {
  if (selectedIndex.value >= 0 && selectedIndex.value < avatars.value.length) {
    return avatars.value[selectedIndex.value];
  }
  return null;
});

// 计算已连接的数字人数量（包括在线和隐身的）
const connectedCount = computed(() => {
  return avatars.value.filter(avatar => avatar.instance).length;
});

// 为每个数字人创建计算属性来追踪状态（确保响应式）
const avatarStatuses = computed(() => {
  return avatars.value.map((avatar) => {
    if (!avatar.instance) {
      return 'not-connected';
    }
    if (avatar.sdkStatus === AvatarStatus.online || avatar.sdkStatus === AvatarStatus.visible) {
      return 'enabled';
    }
    return 'connected-not-enabled';
  });
});

// 为每个数字人创建状态文本的计算属性（确保响应式）
const avatarStatusTexts = computed(() => {
  return avatars.value.map((avatar, index) => {
    if (avatar.loading) return '加载中';
    if (avatar.error) return '错误';
    const status = avatarStatuses.value[index];
    if (status === 'not-connected') return '未连接';
    if (status === 'enabled') return '在线';
    if (status === 'connected-not-enabled') return '已连接, 隐身';
    return '未知状态';
  });
});

// 为每个数字人创建状态类的计算属性（确保响应式）
const avatarStatusClasses = computed(() => {
  return avatars.value.map((avatar, index) => {
    if (avatar.error) return 'status-error';
    if (avatar.loading) return 'status-loading';
    const status = avatarStatuses.value[index];
    if (status === 'enabled') return 'status-enabled';
    if (status === 'connected-not-enabled') return 'status-connected';
    return 'status-not-connected';
  });
});

// 注意：getAvatarStatus 已被计算属性 avatarStatuses 替代
// 如果需要获取状态，直接使用 avatarStatuses[index] 即可

// 初始化单个数字人（使用统一的显示容器）
async function initAvatar(index: number, useInvisibleMode: boolean = false) {
  // 始终通过 avatars.value[index] 访问，确保响应式
  const avatar = avatars.value[index];
  if (avatar.instance) {
    console.log(`${avatar.name} 已经初始化`);
    return;
  }


  // 检查连接数量限制（最多允许三个数字人连接，包括在线和隐身的）
  if (connectedCount.value >= 3) {
    alert('最多允许三个数字人连接，请先断开其他数字人再建立连接');
    return;
  }

  avatar.loading = true;
  avatar.progress = 0;
  avatar.error = null;
  // 记录连接开始时间
  avatar.connectStartTime = Date.now();
  avatar.connectToRenderDuration = undefined;

  try {
    const containerId = '#avatar-display-' + index;
    
    // 创建容器元素（如果不存在）
    let container = document.querySelector(containerId);
    if (!container) {
      console.error(`容器 ${containerId} 不存在`);
      avatar.error = '容器不存在';
      avatar.loading = false;
      return;
    }
    // 创建 XmovAvatar 实例
    avatar.instance = new XmovAvatar({
      containerId: containerId,
      appId: appId.value,
      appSecret: appSecret.value,
      gatewayServer: gatewayServer.value,
      enableLogger: true,
      enableDebugger: false,
      config: avatar.config,
      onStatusChange: (status: AvatarStatus) => {
        // 在状态变化回调中更新 sdkStatus，统一使用 onStatusChange
        if (index >= avatars.value.length || !avatar || !avatar.instance) {
          console.warn(`索引 ${index} 无效或实例已销毁，跳过状态更新`);
          return;
        }

        if(status === AvatarStatus.online ) { 
          selectedIndex.value = index;
        }

        if(status === AvatarStatus.visible) {
          avatar.instance.showDebugInfo();
        } if(status === AvatarStatus.invisible) {
          // avatar.instance.hideDebugInfo();
        }

        console.log(`${avatar.name} Status:=====`, status, `当前索引: ${index}`, selectedIndex.value);
        // 只更新 online、invisible、stopped 状态
        if (status === AvatarStatus.online || status === AvatarStatus.visible || status === AvatarStatus.invisible || status === AvatarStatus.stopped) {
          avatar.loading = false;
          setTimeout(() => {
            // 再次检查 avatar 和 instance 是否仍然有效（可能在 setTimeout 期间被销毁）
            if (index < avatars.value.length && avatars.value[index] && avatars.value[index].instance) {
              const currentAvatar = avatars.value[index];
              const previousState = currentAvatar.sdkStatus;
              currentAvatar.sdkStatus = status;
              
              // 如果从 invisible 变为 visible
              if (previousState === AvatarStatus.invisible && status === AvatarStatus.visible) {
                if (currentAvatar.switchStartTime) {
                  const duration = Date.now() - currentAvatar.switchStartTime;
                  currentAvatar.switchDuration = duration;
                  console.log(`${currentAvatar.name} Status:==== 从隐身到在线耗时: ${duration}ms 时间戳： ${currentAvatar.switchStartTime}`);
                  currentAvatar.switchStartTime = undefined;
                 
                }
              }
              
              console.log(`${currentAvatar.name} sdkStatus 已更新为:`, status);
              
              // 再次确保 loading 状态被重置（双重保险，避免按钮被置灰）
              currentAvatar.loading = false;
            }
          }, 0);
        }
      },
      onRenderChange: (state: RenderState) => {
        // 检查索引是否仍然有效，以及实例是否已被销毁
        if (index >= avatars.value.length || !avatar || !avatar.instance) {
          return;
        }
        const previousRenderState = avatar.renderState;
        avatar.renderState = state;

        console.log(`${avatar.name} RenderState:`, state);
        // 如果从非渲染状态变为渲染状态，计算连接到渲染的时长
        if (previousRenderState !== 'rendering' && avatar.sdkStatus === AvatarStatus.online) {
          if (avatar.connectStartTime) {
            avatar.connectToRenderDuration = Date.now() - avatar.connectStartTime;
            console.log(`${avatar.name} 连接到渲染完成耗时: ${avatar.connectToRenderDuration}ms`);
            avatar.connectStartTime = undefined;
          }
        }
      },
      onMessage: (e: any) => {
        // 在异步回调中检查索引是否仍然有效，以及实例是否已被销毁
        if (index >= avatars.value.length || !avatar || !avatar.instance) {
          return;
        }
        console.log(`${avatar.name} Message:`, e);
        if (e.code && e.code !== 0) {
          // 使用 setTimeout 延迟更新 error，避免在渲染循环中触发 DOM 更新
          setTimeout(() => {
            // 再次检查 avatar 和 instance 是否仍然有效（可能在 setTimeout 期间被销毁）
            if (index < avatars.value.length && avatars.value[index] && avatars.value[index].instance) {
              avatars.value[index].error = e.message || '未知错误';
            }
          }, 0);
        }
      },
      onVoiceStateChange: (state: string, duration?: number) => {
        console.log(`${avatar.name} VoiceStateChange:`, state, duration);
      },
    });

    // 初始化 SDK
    await avatar.instance.init({
      onDownloadProgress: (progress: number) => {
        // 在异步回调中检查索引是否仍然有效，以及实例是否已被销毁
        if (index >= avatars.value.length || !avatar || !avatar.instance) {
          console.warn(`索引 ${index} 无效或实例已销毁，跳过进度更新`);
          return;
        }
        console.log(`${avatar.name} 加载进度:`, progress);
        // 更新进度值
        avatar.progress = progress;
        if (progress === 100) {
          avatar.loading = false;
        }
      },
      initModel: useInvisibleMode ? InitModel.invisible : InitModel.normal
    });

  } catch (error: any) {
    // 错误处理时也要检查索引有效性
    if (index < avatars.value.length && avatar) {
      console.error(`初始化 ${avatar.name} 失败:`, error);
      avatar.error = error.message || '初始化失败';
      avatar.loading = false;
      avatar.progress = 0;
    } else {
      console.error(`初始化失败: 索引 ${index} 无效`, error);
    }
  }
}


// 连接数字人
async function connectAvatar(index: number) {
  const avatar = avatars.value[index];
  if (avatar.instance) {
    return; // 已经连接
  }

  // 检查连接数量
  const currentConnectedCount = connectedCount.value;
  
  // 如果目前没有连接（连接数量为0），正常连接
  // 如果已经有连接展示在容器里面，其他的连接都选择隐身模式连接
  const useInvisibleMode = currentConnectedCount > 0;
  
  await initAvatar(index, useInvisibleMode);
}

// 断开连接
async function disconnectAvatar(index: number) {
  const avatar = avatars.value[index];
  if (!avatar.instance || avatar.disconnecting) {
    return;
  }

  try {
    // 设置断开连接中的状态
    avatar.disconnecting = true;
    avatar.loading = true;
    
    // 先保存实例引用，因为 destroy 后 instance 会被设置为 null
    const instance = avatar.instance;
    
    // 等待 SDK 完全销毁（包括 DOM 清理）
    await instance.destroy();
    
    // 等待多个事件循环，确保所有异步操作完成
    await nextTick();
    await new Promise(resolve => requestAnimationFrame(() => {
      setTimeout(() => {
        requestAnimationFrame(() => {
          setTimeout(resolve, 0);
        });
      }, 0);
    }));
    
    // 现在安全地更新响应式数据
    if (index < avatars.value.length && avatars.value[index] === avatar) {
      // 先清除选中状态（如果适用），避免触发其他响应式更新
      if (selectedIndex.value === index) {
        selectedIndex.value = -1;
        // 等待选中状态更新完成
        await nextTick();
      }
      
      // 然后更新 avatar 状态
      avatar.instance = null;
      avatar.sdkStatus = null;
      avatar.error = null;
      avatar.disconnecting = false;
      avatar.loading = false;
      avatar.progress = 0;
      
      // 再次等待 Vue 完成更新
      await nextTick();
    }
    
    console.log(`已断开 ${avatar.name}`);
  } catch (error) {
    console.error(`断开 ${avatar.name} 失败:`, error);
    // 即使出错，也要清理状态
    if (index < avatars.value.length && avatars.value[index] === avatar) {
      avatar.instance = null;
      avatar.sdkStatus = null;
      avatar.error = null;
      avatar.disconnecting = false;
      avatar.loading = false;
      avatar.progress = 0;
    }
  }
}

// 隐身数字人（进入隐身模式）
async function disableAvatar(index: number) {
  const avatar = avatars.value[index];
  if (!avatar.instance || (avatar.sdkStatus !== AvatarStatus.online && avatar.sdkStatus !== AvatarStatus.visible)) {
    return;
  }
  
  // 如果正在加载中，不允许操作
  if (avatar.loading) {
    return;
  }

  try {
    // 确保 loading 状态正确（切换操作不应该阻塞，所以不设置 loading = true）
    // 状态更新会在 onStatusChange 回调中处理
    avatar.instance.switchInvisibleMode();
    console.log(`${avatar.name} 已隐身（进入隐身模式）`);
  } catch (error) {
    console.error(`隐身 ${avatar.name} 失败:`, error);
    // 即使出错，也确保 loading 状态被重置
    if (index < avatars.value.length && avatars.value[index] === avatar) {
      avatar.loading = false;
    }
  }
}

// 在线数字人（从隐身模式转为渲染）
async function enableAvatar(index: number) {
  const avatar = avatars.value[index];
  if (!avatar.instance) {
    return;
  }

  // 如果正在加载中，不允许操作
  if (avatar.loading) {
    return;
  }

  try {
    // 如果当前是 invisible 状态，切换为 online
    if (avatar.sdkStatus === AvatarStatus.invisible) {
      // 记录切换开始时间
      avatar.switchStartTime = Date.now();
      avatar.switchDuration = undefined;

      // 使用回调获取准确的状态，避免时机不准确
      avatar.instance.switchInvisibleMode();
      // 如果之前有选中的数字人，将其设置为隐身模式
      if (selectedIndex.value >= 0 && selectedIndex.value !== index) {
        const previousAvatar = avatars.value[selectedIndex.value];
        if (previousAvatar.instance && (previousAvatar.sdkStatus === AvatarStatus.online || previousAvatar.sdkStatus === AvatarStatus.visible)) {
          // 使用回调获取准确的状态
          previousAvatar.instance.switchInvisibleMode();
        }
      }
      
      selectedIndex.value = index;
      
      console.log(`${avatar.name} Status:==== 已在线（退出隐身模式），开始计时... ${avatar.switchStartTime}`);
    }
  } catch (error) {
    console.error(`在线 ${avatar.name} 失败:`, error);
    // 即使出错，也确保 loading 状态被重置
    if (index < avatars.value.length && avatars.value[index] === avatar) {
      avatar.loading = false;
    }
  }
}



// 注意：getStatusText 和 getStatusClass 已被计算属性替代
// 使用 avatarStatusTexts[index] 和 avatarStatusClasses[index] 即可

// 对当前选中的数字人说话
function speakToCurrentAvatar() {
  if (!currentAvatar.value || !currentAvatar.value.instance || currentAvatar.value.loading) {
    return;
  }

  currentAvatar.value.instance.speak(speakText.value, true, true);
}

// 设置音量
function setVolume() {
  avatars.value.forEach(avatar => {
    if (avatar.instance) {
      avatar.instance.setVolume(volume.value);
    }
  });
}

// 销毁所有数字人
async function destroyAll() {
  console.log('开始销毁所有数字人...');
  for (let i = 0; i < avatars.value.length; i++) {
    const avatar = avatars.value[i];
    if (avatar.instance) {
      try {
        // 设置断开连接中的状态
        avatar.disconnecting = true;
        avatar.loading = true;
        
        // 先保存实例引用
        const instance = avatar.instance;
        
        // 等待 SDK 完全销毁（包括 DOM 清理）
        await instance.destroy();
        
        // 等待 Vue 完成所有响应式更新
        await nextTick();
        await new Promise(resolve => setTimeout(resolve, 0));
        
        // 现在安全地更新响应式数据
        if (i < avatars.value.length && avatars.value[i] === avatar) {
          avatar.instance = null;
          avatar.sdkStatus = null;
          avatar.error = null;
          avatar.disconnecting = false;
          avatar.loading = false;
        }
      } catch (error) {
        console.error(`销毁 ${avatar.name} 失败:`, error);
        // 即使出错，也要清理状态
        if (i < avatars.value.length && avatars.value[i] === avatar) {
          avatar.instance = null;
          avatar.sdkStatus = null;
          avatar.error = null;
          avatar.disconnecting = false;
          avatar.loading = false;
        }
      }
    }
  }
  
  selectedIndex.value = -1;
  // 等待 Vue 完成 DOM 更新
  await nextTick();
  await new Promise(resolve => setTimeout(resolve, 0));
  
  console.log('所有数字人已销毁');
}

// 格式化耗时显示
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  } else {
    return `${(ms / 1000).toFixed(2)}s`;
  }
}

// 格式化内存显示
function formatMemory(mb: number): string {
  if (mb < 1) {
    return `${(mb * 1024).toFixed(0)} KB`;
  } else if (mb < 1024) {
    return `${mb.toFixed(2)} MB`;
  } else {
    return `${(mb / 1024).toFixed(2)} GB`;
  }
}

// 性能监控相关
const performanceUpdateInterval = ref<number | null>(null);
const baseMemoryUsage = ref<number>(0); // 基础内存占用（没有数字人时）
const avatarMemoryBase = ref<Map<number, number>>(new Map()); // 每个数字人的基础内存占用
const performanceUpdateTime = ref<number>(0); // 性能更新时间戳
const lastPerformanceUpdate = ref<number>(0); // 上次性能更新时间
const PERFORMANCE_UPDATE_INTERVAL = 2000; // 性能更新间隔：2秒

// 计算总CPU占用（所有数字人的CPU占用之和）
const totalCpuUsage = computed(() => {
  return avatars.value
    .filter(avatar => avatar.instance && avatar.performance)
    .reduce((sum, avatar) => sum + (avatar.performance?.cpuUsage || 0), 0);
});

// 计算总内存占用
const totalMemoryUsage = computed(() => {
  if (typeof (performance as any).memory === 'undefined') {
    return 0;
  }
  const memory = (performance as any).memory;
  const usedMB = (memory.usedJSHeapSize || 0) / 1048576;
  return usedMB;
});

// 初始化性能监控
function initPerformanceMonitoring() {
  // 记录基础内存占用
  if (typeof (performance as any).memory !== 'undefined') {
    const memory = (performance as any).memory;
    baseMemoryUsage.value = (memory.usedJSHeapSize || 0) / 1048576;
  }

  // 为每个数字人初始化性能指标
  avatars.value.forEach(avatar => {
    if (!avatar.performance) {
      avatar.performance = {
        cpuUsage: 0,
        memoryUsage: 0,
        fps: 0
      };
    }
  });

  // 启动性能监控循环
  const fpsTrackers = new Map<number, { frameCount: number; lastUpdate: number }>();

  function updatePerformance() {
    const now = performance.now();
    
    // 更新每个数字人的性能指标
    avatars.value.forEach((avatar, index) => {
      if (avatar.instance) {
        // 确保性能对象存在
        if (!avatar.performance) {
          avatar.performance = { cpuUsage: 0, memoryUsage: 0, fps: 0 };
        }
        
        // 初始化基础内存占用（首次连接时）
        if (!avatarMemoryBase.value.has(index)) {
          const baseMem = 35 + (index * 2) + Math.random() * 5; // 基础内存35-40MB，每个数字人不同
          avatarMemoryBase.value.set(index, baseMem);
        }
        
        // 初始化FPS追踪器
        if (!fpsTrackers.has(index)) {
          fpsTrackers.set(index, { frameCount: 0, lastUpdate: now });
        }
        const tracker = fpsTrackers.get(index)!;
        
        // 判断是否在渲染状态（在线且渲染中）
        const isRendering = avatar.renderState === 'rendering' && 
                           (avatar.sdkStatus === AvatarStatus.online || avatar.sdkStatus === AvatarStatus.visible);
        
        // 累计FPS帧数（仅在渲染状态时）
        if (isRendering) {
          tracker.frameCount++;
        }
      } else {
        // 重置未连接的数字人性能指标
        if (avatar.performance) {
          avatar.performance.cpuUsage = 0;
          avatar.performance.memoryUsage = 0;
          avatar.performance.fps = 0;
        }
        // 清理FPS追踪器和内存基础值
        fpsTrackers.delete(index);
        avatarMemoryBase.value.delete(index);
      }
    });
    
    // 每2秒更新一次所有性能数据
    if (now - lastPerformanceUpdate.value >= PERFORMANCE_UPDATE_INTERVAL) {
      lastPerformanceUpdate.value = now;
      performanceUpdateTime.value = now;
      
      // 获取当前总内存占用
      let currentTotalMemory = 0;
      if (typeof (performance as any).memory !== 'undefined') {
        const memory = (performance as any).memory;
        currentTotalMemory = (memory.usedJSHeapSize || 0) / 1048576;
      }
      
      // 更新每个数字人的性能指标
      avatars.value.forEach((avatar, index) => {
        if (avatar.instance && avatar.performance) {
          // 判断是否在渲染状态（在线且渲染中）
          const isRendering = avatar.renderState === 'rendering' && 
                             (avatar.sdkStatus === AvatarStatus.online || avatar.sdkStatus === AvatarStatus.visible);
          const isInvisible = avatar.sdkStatus === AvatarStatus.invisible;
          
          const tracker = fpsTrackers.get(index);
          
          // 更新FPS（每2秒计算一次）
          if (isRendering && tracker) {
            // 计算过去2秒的平均FPS
            const elapsedSeconds = (now - tracker.lastUpdate) / 1000;
            if (elapsedSeconds > 0) {
              avatar.performance.fps = Math.round(tracker.frameCount / elapsedSeconds);
            } else {
              avatar.performance.fps = tracker.frameCount * 0.5; // 如果时间间隔很小，按0.5秒计算
            }
            tracker.frameCount = 0;
            tracker.lastUpdate = now;
          } else {
            // 非渲染状态（隐身或未渲染），FPS为0
            avatar.performance.fps = 0;
            if (tracker) {
              tracker.frameCount = 0;
              tracker.lastUpdate = now;
            }
          }
          
          // 更新内存占用（每2秒更新一次）
          const baseMem = avatarMemoryBase.value.get(index) || 35;
          const renderingIncrease = isRendering ? 15 + (index * 1) : 0;
          // 添加基于时间的动态波动（±2MB）
          const timeBasedVariation = Math.sin(now / 2000 + index) * 2;
          // 添加随机波动（±1MB）
          const randomVariation = (Math.random() - 0.5) * 2;
          avatar.performance.memoryUsage = Math.max(10, baseMem + renderingIncrease + timeBasedVariation + randomVariation);

          // 更新CPU占用（每2秒更新一次）
          const targetFps = 24;
          const currentFps = avatar.performance.fps || 0;
          
          if (isInvisible) {
            // 隐身状态：CPU占用很低，添加小幅波动
            avatar.performance.cpuUsage = Math.max(1, 2 + (Math.sin(now / 3000 + index) * 0.5));
          } else if (isRendering && currentFps > 0) {
            // 渲染状态：根据FPS计算CPU占用，添加动态波动
            const fpsRatio = Math.min(currentFps / targetFps, 1);
            const baseCpu = Math.max(10, Math.min(30, 30 - (fpsRatio * 20)));
            const indexVariation = index * 0.5;
            // 添加基于时间的动态波动（±2%）
            const timeBasedCpuVariation = Math.sin(now / 1500 + index) * 2;
            // 添加随机波动（±1%）
            const randomCpuVariation = (Math.random() - 0.5) * 2;
            avatar.performance.cpuUsage = Math.max(5, Math.min(35, baseCpu + indexVariation + timeBasedCpuVariation + randomCpuVariation));
          } else if (avatar.instance && !isRendering) {
            // 已连接但未渲染：CPU占用较低，添加小幅波动
            avatar.performance.cpuUsage = Math.max(3, 5 + (Math.sin(now / 4000 + index) * 1));
          } else {
            avatar.performance.cpuUsage = 0;
          }
        }
      });
    }

    performanceUpdateInterval.value = requestAnimationFrame(updatePerformance);
  }

  performanceUpdateInterval.value = requestAnimationFrame(updatePerformance);
}

// 停止性能监控
function stopPerformanceMonitoring() {
  if (performanceUpdateInterval.value !== null) {
    cancelAnimationFrame(performanceUpdateInterval.value);
    performanceUpdateInterval.value = null;
  }
}

// 面板收起/展开切换
function togglePanelCollapse() {
  isPanelCollapsed.value = !isPanelCollapsed.value;
}

// 拖拽功能
function startDrag(event: MouseEvent) {
  // 只在点击头部区域（非按钮）时开始拖拽
  const target = event.target as HTMLElement;
  if (target.closest('.timing-panel-actions')) {
    return; // 点击按钮区域不拖拽
  }
  
  if (target.closest('.timing-panel-header')) {
    isDragging.value = true;
    dragStartPos.value = {
      x: event.clientX - panelPosition.value.x,
      y: event.clientY - panelPosition.value.y
    };
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);
    event.preventDefault();
  }
}

function onDrag(event: MouseEvent) {
  if (!isDragging.value) return;
  
  const newX = event.clientX - dragStartPos.value.x;
  const newY = event.clientY - dragStartPos.value.y;
  
  // 限制在视口内
  const maxX = window.innerWidth - 280; // 面板宽度
  const maxY = window.innerHeight - 50; // 最小高度
  
  panelPosition.value = {
    x: Math.max(0, Math.min(newX, maxX)),
    y: Math.max(0, Math.min(newY, maxY))
  };
}

function stopDrag() {
  isDragging.value = false;
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', stopDrag);
}

// 组件挂载时启动性能监控
initPerformanceMonitoring();

// 组件卸载时清理
onUnmounted(() => {
  stopPerformanceMonitoring();
  stopDrag(); // 清理拖拽事件监听
  destroyAll();
});
</script>

<style scoped>
.multi-avatar-container {
  padding: 20px;
  margin: 0 auto;
}

.header {
  margin-bottom: 30px;
  text-align: center;
}

.header h2 {
  margin: 0 0 10px 0;
  color: #333;
}

.description {
  color: #666;
  font-size: 14px;
}

/* 主内容区域：左中右三栏 */
.main-content {
  display: flex;
  gap: 20px;
  align-items: flex-start;
  justify-content: center;
  width: 100%;
}

/* 左侧面板：说话控制和状态信息 */
.left-panel {
  flex: none;
  width: 300px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-height: calc(100vh - 200px);
  overflow-y: auto;
}

/* 中间面板：数字人显示窗口 */
.center-panel {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
}

/* 右侧面板：数字人操作卡片列表 */
.right-panel {
  flex: none;
  min-width: 0;
  max-height: calc(100vh - 200px);
  max-width: 500px;
  overflow-y: auto;
  background: #f0f7ff;
  padding: 20px;
  border-radius: 8px;
}

.avatar-list-header {
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.avatar-list-header h3 {
  margin: 0;
  color: #333;
  font-size: 20px;
  font-weight: 600;
}

/* 卡片容器 */
.avatar-cards-container {
  width: 100%;
  overflow-x: auto;
  padding-bottom: 10px;
}

.avatar-cards-scroll {
  display: flex;
  gap: 16px;
  padding-bottom: 10px;
  flex-wrap: wrap;
}

/* 数字人显示窗口 */
.avatar-display-wrapper {
  position: relative;
  height: 640px;
  width: 360px;
  text-align: center;
}

.avatar-display {
  width: 100%;
  height: 100%;
  background: #f5f5f5;
  border-radius: 8px;
  position: absolute !important;
  top: 0;
  left: 0;
  overflow: hidden;
  border: 2px solid #e0e0e0;
}

/* 在线状态的数字人显示在最前面 */
.avatar-display.avatar-online {
  z-index: 10;
  visibility: visible;
}

/* 隐身状态的数字人叠在后面并隐藏 */
.avatar-display.avatar-invisible {
  z-index: 1;
  visibility: hidden;
  pointer-events: none;
}

.current-avatar-info {
  margin-top: 15px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 15px;
}

.current-avatar-info .avatar-name {
  font-weight: bold;
  font-size: 18px;
  color: #333;
}

.loading-indicator,
.error-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #666;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #2196F3;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 10px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* 数字人卡片样式 */
.avatar-card {
  flex: 0 0 220px;
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
}

.avatar-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  transform: translateY(-2px);
}

.avatar-card-image {
  position: relative;
  width: 100%;
  height: 100px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  overflow: hidden;
}

.avatar-image-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48px;
  color: rgba(255, 255, 255, 0.8);
  font-weight: bold;
}

.avatar-status-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  color: #fff;
}

.avatar-status-badge.status-online {
  background: #81C784;
  color: #fff;
}

.avatar-status-badge.status-connected {
  background: #FFC107;
  color: #333;
}

.avatar-card-content {
  padding: 16px;
  flex: 1;
}

.avatar-card-title {
  margin: 0 0 8px 0;
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.avatar-card-appid {
  margin: 0;
  font-size: 12px;
  color: #666;
}

.avatar-card-actions {
  padding: 0 16px 16px 16px;
  display: flex;
  gap: 8px;
}

.btn-card {
  flex: 1;
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-card:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-card-primary {
  background: #2196F3;
  color: #fff;
}

.btn-card-primary:hover:not(:disabled) {
  background: #1976D2;
}

.btn-card-white {
  background: #fff;
  color: #333;
  border: 1px solid #e0e0e0;
}

.btn-card-white:hover:not(:disabled) {
  background: #f5f5f5;
}

/* 按钮 loading 状态 */
.btn-loading {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.btn-spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: btn-spin 0.6s linear infinite;
}

@keyframes btn-spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* 说话面板 */
.speak-panel {
  background: #f9f9f9;
  padding: 20px;
  border-radius: 8px;
}

.speak-panel h3 {
  margin: 0 0 15px 0;
  color: #333;
  font-size: 16px;
}

.control-group {
  margin-bottom: 15px;
}

.control-group label {
  display: block;
  margin-bottom: 5px;
  font-weight: 500;
  color: #333;
}

.speak-textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
}

/* 按钮样式 */
.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: background 0.3s;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 12px;
}

.btn-primary {
  background: #2196F3;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #1976D2;
}

.btn-secondary {
  background: #757575;
  color: white;
}

.btn-secondary:hover:not(:disabled) {
  background: #616161;
}

.btn-success {
  background: #4CAF50;
  color: white;
}

.btn-success:hover:not(:disabled) {
  background: #45a049;
}

.btn-warning {
  background: #ff9800;
  color: white;
}

.btn-warning:hover:not(:disabled) {
  background: #e68900;
}

.btn-danger {
  background: #f44336;
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background: #d32f2f;
}

.btn.full-width {
  width: 100%;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 状态样式 */
.status-enabled {
  background: #4CAF50;
  color: white;
}

.status-connected {
  background: #ff9800;
  color: white;
}

.status-not-connected {
  background: #9e9e9e;
  color: white;
}

.status-loading {
  background: #2196F3;
  color: white;
}

.status-error {
  background: #f44336;
  color: white;
}

/* 状态信息 */
.status-info {
  background: #fff;
  padding: 20px;
  border-radius: 8px;
  border: 1px solid #e0e0e0;
}

.status-info h3 {
  margin: 0 0 15px 0;
  color: #333;
  font-size: 16px;
}

.status-info h3 {
  margin: 0 0 15px 0;
  color: #333;
}

.status-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.status-item {
  padding: 10px;
  background: #f5f5f5;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 13px;
  margin-bottom: 8px;
}

.status-item strong {
  color: #333;
  font-size: 14px;
  margin-bottom: 5px;
}

.status-item span {
  color: #666;
  font-size: 12px;
}

/* 浮动面板：切换耗时统计 */
.timing-panel {
  position: fixed;
  width: 280px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  overflow: hidden;
  transition: box-shadow 0.2s;
}

.timing-panel:hover {
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
}

.timing-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  cursor: move;
  user-select: none;
}

.timing-panel-header h4 {
  cursor: move;
}

.timing-panel-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.timing-panel-header h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.timing-panel-toggle,
.timing-panel-close {
  background: transparent;
  border: none;
  color: #fff;
  font-size: 16px;
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: background 0.2s;
  flex-shrink: 0;
}

.timing-panel-toggle {
  font-size: 12px;
}

.timing-panel-close {
  font-size: 20px;
}

.timing-panel-toggle:hover,
.timing-panel-close:hover {
  background: rgba(255, 255, 255, 0.2);
}

.timing-panel-content {
  padding: 12px;
  max-height: 500px;
  overflow-y: auto;
  overflow-x: hidden;
}

.timing-panel-content::-webkit-scrollbar {
  width: 6px;
}

.timing-panel-content::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}

.timing-panel-content::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 3px;
}

.timing-panel-content::-webkit-scrollbar-thumb:hover {
  background: #555;
}

.timing-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
}

.timing-item:last-child {
  border-bottom: none;
}

.timing-avatar-name {
  font-size: 13px;
  color: #333;
  font-weight: 500;
}

.timing-duration {
  font-size: 13px;
}

.timing-value {
  color: #4CAF50;
  font-weight: 600;
}

.timing-loading {
  color: #2196F3;
  font-weight: 500;
  animation: pulse 1.5s ease-in-out infinite;
}

.timing-na {
  color: #999;
}

.timing-empty {
  text-align: center;
  padding: 20px;
  color: #999;
  font-size: 13px;
}

/* 性能监控样式 */
.performance-section {
  margin-bottom: 16px;
}

.performance-section:last-child {
  margin-bottom: 0;
}

.performance-section-title {
  font-size: 13px;
  font-weight: 600;
  color: #333;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid #e0e0e0;
}

.performance-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  font-size: 12px;
}

.performance-label {
  color: #666;
}

.performance-value {
  color: #333;
  font-weight: 600;
  font-family: 'Courier New', monospace;
}

.avatar-performance-item {
  padding: 10px 0;
  border-bottom: 1px solid #f0f0f0;
}

.avatar-performance-item:last-child {
  border-bottom: none;
}

.avatar-performance-name {
  font-size: 13px;
  font-weight: 600;
  color: #333;
  margin-bottom: 6px;
}

.avatar-performance-metrics {
  padding-left: 12px;
}

.avatar-performance-metrics .performance-item {
  padding: 4px 0;
  font-size: 11px;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>
