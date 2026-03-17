# SDK 行走功能使用说明

## 概述

SDK 支持数字人在画布上水平移动的行走功能，通过配置行走点位和监听行走状态，可以实现数字人在不同位置之间的移动动画。

## 快速开始（落地实践）

### 步骤 1：准备配置数据

准备 Layout 和 WalkConfig 配置对象：

```javascript
// Layout 配置
const layout = {
  container: {
    size: [1440, 810]      // 根据实际需求设置容器尺寸
  },
  avatar: {
    v_align: "center",
    h_align: "middle",
    scale: 0.3,           // 根据实际需求调整缩放比例
    offset_x: 0,
    offset_y: 0
  }
};

// WalkConfig 配置
// 重要：点位间距必须大于 50px，建议设置为 100px
const walkConfig = {
  min_x_offset: -500,      // 最左侧位置
  max_x_offset: 500,       // 最右侧位置
  walk_points: {
    "A": -500,             // 点位间距 100px
    "B": -400,
    "C": -300,
    "D": -200,
    "E": -100,
    "F": 0,                // 中心点位
    "G": 100,
    "H": 200,
    "I": 300,
    "J": 400,
    "K": 500
  },
  init_point: 0            // 初始位置
};
```

### 步骤 2：初始化 SDK 并传入配置

在初始化 SDK 时，将配置添加到 `config` 对象中：

```javascript
import XmovAvatar from '@xmov/offline-sdk';

const sdk = new XmovAvatar({
  containerId: '#avatar-container',
  appId: 'your-app-id',
  appSecret: 'your-app-secret',
  gatewayServer: 'wss://your-gateway-server',
  cacheServer: 'https://your-cache-server',
  config: {
    // ... 其他配置项（如 look_name、tts_vcn_id 等）
    layout: layout,           // 布局配置
    walk_config: walkConfig   // 行走配置
  },
  onWalkStateChange: (state) => {
    // 监听行走状态
    console.log('行走状态:', state);
  }
});

// 初始化 SDK
await sdk.init();

// 开始会话
await sdk.start();
```

### 步骤 3：监听行走状态（可选）

通过 `onWalkStateChange` 回调处理行走开始和结束事件：

```javascript
const sdk = new XmovAvatar({
  // ... 其他配置
  onWalkStateChange: (state) => {
    if (state === 'walk_start') {
      console.log('数字人开始行走');
      // 可以在这里处理行走开始时的业务逻辑
      // 例如：显示提示信息、暂停其他动画等
    } else if (state === 'walk_end') {
      console.log('数字人行走结束');
      // 可以在这里处理行走结束时的业务逻辑
      // 例如：恢复其他动画、更新UI状态等
    }
  }
});
```

### 步骤 4：运行时动态更新配置（可选）

如果需要动态调整布局或行走点位，可以在运行时更新：

```javascript
// 更新布局配置
sdk.changeLayout({
  container: {
    size: [1920, 1080]
  },
  avatar: {
    v_align: "center",
    h_align: "middle",
    scale: 0.5,
    offset_x: 0,
    offset_y: 0
  }
});

// 更新行走配置
sdk.changeWalkConfig({
  min_x_offset: -300,
  max_x_offset: 300,
  walk_points: {
    "LEFT": -300,
    "CENTER": 0,
    "RIGHT": 300
  },
  init_point: 0
});
```

## 配置说明

### Layout 接口

```typescript
interface Layout {
  container: {
    size: number[];        // 容器尺寸 [宽度, 高度]
  };
  avatar: {
    v_align: string;       // 垂直对齐：'left' | 'center' | 'right'
    h_align: string;      // 水平对齐：'top' | 'center' | 'bottom' | 'middle'
    scale: number;         // 人物缩放比例（人物大小 = 分辨率 * scale）
    offset_x: number;      // X 轴偏移量（像素）
    offset_y: number;      // Y 轴偏移量（像素）
  };
}
```

### WalkConfig 接口

```typescript
interface WalkConfig {
  min_x_offset: number;    // 最小 X 轴偏移量（像素）
  max_x_offset: number;    // 最大 X 轴偏移量（像素）
  walk_points: {           // 行走点位配置
    [key: string]: number; // 点位名称 -> X 轴偏移值
  };
  init_point: number;      // 初始位置（X 轴偏移值）
}
```

### 参数说明

**Layout 参数：**
- `container.size`: 容器尺寸 `[宽度, 高度]`，单位像素
- `avatar.v_align`: 垂直对齐方式，可选值 `'left' | 'center' | 'right'`
- `avatar.h_align`: 水平对齐方式，可选值 `'top' | 'center' | 'bottom' | 'middle'`
- `avatar.scale`: 人物缩放比例，计算公式：人物大小 = 分辨率 × scale
- `avatar.offset_x`: X 轴偏移量（像素），用于微调位置
- `avatar.offset_y`: Y 轴偏移量（像素），用于微调位置

**WalkConfig 参数：**
- `min_x_offset`: 最小 X 轴偏移量（像素），定义最左侧位置
- `max_x_offset`: 最大 X 轴偏移量（像素），定义最右侧位置
- `walk_points`: 行走点位配置对象，键为点位名称，值为 X 轴偏移值
- `init_point`: 初始位置（X 轴偏移值），建议设置在 `min_x_offset` 和 `max_x_offset` 之间

## 工作原理

1. **后端数据**：后端通过 `body_data` 事件发送每帧的 `x_offset` 数据
2. **位置计算**：SDK 根据 `x_offset` 值计算数字人的水平位置
3. **Canvas 移动**：通过 CSS `transform: translateX()` 实现数字人画布的水平移动
4. **事件触发**：当收到 `walk_start` 或 `walk_end` 事件时，触发 `onWalkStateChange` 回调

## 注意事项

### Layout 配置
1. **容器尺寸**：`container.size` 定义画布容器的大小，影响数字人的显示区域
2. **对齐方式**：`v_align` 和 `h_align` 控制数字人在容器中的对齐位置
3. **缩放比例**：`scale` 控制数字人大小，计算公式：人物大小 = 分辨率 × scale
4. **偏移量**：`offset_x` 和 `offset_y` 用于微调数字人位置

### WalkConfig 配置
1. **坐标系统**：`x_offset` 使用像素单位，负值表示向左移动，正值表示向右移动
2. **配置范围**：`walk_points` 中的点位值应在 `min_x_offset` 和 `max_x_offset` 范围内
3. **初始位置**：`init_point` 建议设置在 `min_x_offset` 和 `max_x_offset` 之间
4. **点位间距**：**重要** - 每个点位之间的间距必须大于半步（50px 以上），**建议设置为 100px**，以确保行走动画的流畅性
5. **动态更新**：可以在运行时通过 `changeLayout()` 和 `changeWalkConfig()` 更新配置，无需重新初始化 SDK

## API 参考

### changeLayout(layout: Layout)

动态更新布局配置。

**参数：**
- `layout`: Layout 配置对象

**示例：**
```javascript
sdk.changeLayout({
  container: { size: [1920, 1080] },
  avatar: {
    v_align: "center",
    h_align: "middle",
    scale: 0.5,
    offset_x: 0,
    offset_y: 0
  }
});
```

### changeWalkConfig(walkConfig: WalkConfig)

动态更新行走配置。

**参数：**
- `walkConfig`: WalkConfig 配置对象

**示例：**
```javascript
sdk.changeWalkConfig({
  min_x_offset: -300,
  max_x_offset: 300,
  walk_points: {
    "LEFT": -300,
    "CENTER": 0,
    "RIGHT": 300
  },
  init_point: 0
});
```

### onWalkStateChange(state: string)

行走状态变化回调。

**参数：**
- `state`: 行走状态，值为 `'walk_start'` 或 `'walk_end'`

**示例：**
```javascript
const sdk = new XmovAvatar({
  // ... 其他配置
  onWalkStateChange: (state) => {
    if (state === 'walk_start') {
      console.log('数字人开始行走');
    } else if (state === 'walk_end') {
      console.log('数字人行走结束');
    }
  }
});
```
