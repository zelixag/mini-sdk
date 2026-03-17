# 小程序 SDK 面部渲染调试记录

## 背景

将 Web SDK 的 Avatar 渲染移植到微信小程序 SDK（`miniprogram-sdk`）过程中，面部网格渲染出现系列问题。本文档记录了所有问题、根本原因及修复方案。

---

## 问题一：脸部完全不可见（只有眼珠和半个口腔）

### 现象
渲染结果中只能看到孤立的眼珠和半截口腔，脸部皮肤完全缺失，且位置与身体不吻合。

### 根本原因
`GLDeviceMP.ts` 中的 `texImage2D` 函数在上传 Float32Array blendshape 纹理时，错误地将外部格式 `gl.RGBA` 用作了 WebGL2 的内部格式。

WebGL2 规范要求浮点纹理必须使用 **sized internal format**（`gl.RGBA32F`），而非非尺寸化格式（`gl.RGBA`）。使用错误格式会触发 `INVALID_OPERATION`，导致 blendshape 纹理整体上传失败，所有顶点变形数据丢失。

### 修复
**文件：** `src/utils/GLDeviceMP.ts`

```typescript
// 修复前：内部格式错误地使用了外部格式参数
gl.texImage2D(target, level, format, width, height, 0, format, type, data);

// 修复后：Float32Array 用 RGBA32F，其他用 RGBA
const internalFormat = (type === gl.FLOAT) ? gl.RGBA32F : gl.RGBA;
gl.texImage2D(target, level, internalFormat, width, height, 0, format, type, data);
```

---

## 问题二：脸部放大成巨大 blob 充满全屏

### 现象
脸部数据渲染出来了，但铺满整个屏幕，无法辨认。

### 根本原因 A — movableJointTransforms 数据格式不匹配

`transformMJT()` 函数预期输入为 flat 数组格式 `[tx, ty, tz, qw, qx, qy, qz]`，但 `face-frame-aligner.ts` 实际传入的是对象格式：

```json
{"translate": [x, y, z], "rotate": [qx, qy, qz, qw]}
```

数据格式不匹配导致所有骨骼坐标解析错误，骨骼变换完全失效。

**修复：** `src/utils/DataInterfaceMP.ts` 的 `transformMJT()` 中增加对象格式分支：

```typescript
if (typeof item === 'object' && 'translate' in item) {
    vec = item.translate;
    // 对象格式的 rotate 是 [qx, qy, qz, qw]，需转为 [qw, qx, qy, qz]
    quat = [rot[3], rot[0], rot[1], rot[2]];
}
```

### 根本原因 B — 四元数分量顺序错误

面部追踪提供旋转四元数格式为 `[qx, qy, qz, qw]`（XYZW），但 `RigidTransform` 构造函数期望 `[qw, qx, qy, qz]`（WXYZ）。分量顺序错误导致旋转方向完全反转，骨骼变换失控。

**修复：** `transformMJT()` 中对 4 分量四元数强制重排：

```typescript
if (rot.length >= 4) {
    // 输入 [qx, qy, qz, qw] → 转为 RigidTransform 的 [qw, qx, qy, qz]
    quat = [rot[3], rot[0], rot[1], rot[2]];
}
```

---

## 问题三：脸部整体下移（投影尺寸用错）

### 现象
脸部可见，但整体相对于身体默认脸部往下偏移。

### 根本原因
`renderMesh` 使用 Canvas 尺寸（1179×2262）计算投影矩阵，但 `char.bin` 中的相机参数是针对 body video 内容尺寸（1080×1920）标定的。

额外复杂性：body video 原始帧是**双宽格式**——左半存颜色、右半存 Alpha，实际内容宽度为原始宽度的一半。代码先后错用了 Canvas 尺寸和未处理的原始宽度 2160。

### 修复
**文件：** `src/utils/GLPipelineMP.ts`，`renderMesh` 函数：

```typescript
// body video 是双宽格式（color | alpha），实际内容宽 = videoWidth / 2
const projW = (videoWidth > 0) ? Math.round(videoWidth / 2) : canvasW; // e.g. 1080
const projH = (videoHeight > 0) ? videoHeight : canvasH;               // e.g. 1920

let proj_mat = new Float32Array(flatten(
    mmul(char.cameraConfig.getProjMatrix([projW, projH], 200, 800),
         char.cameraConfig.getExtrinsicMatrix())
));
```

---

## 问题四：全黑屏（ReferenceError）

### 现象
修复问题三后，画面全黑，连身体数据也消失了。

### 根本原因
修复过程中将局部变量 `width`/`height` 重命名为 `canvasW`/`canvasH`，但同一函数下方的 `blitFramebuffer` 调用仍引用旧变量名 `width`/`height`，导致 JavaScript 运行时抛出 `ReferenceError`，渲染流程崩溃。

### 修复
**文件：** `src/utils/GLPipelineMP.ts`

```typescript
const canvasW = this.device.gl.drawingBufferWidth;
const canvasH = this.device.gl.drawingBufferHeight;
// 保留别名，供下方 blitFramebuffer 调用继续使用
const width = canvasW;
const height = canvasH;
```

---

## 问题五：眼珠往下掉、遮罩往上走（骨骼运动幅度不一致）

### 现象
动画播放时，面部皮肤（遮罩）与眼球在特定运动帧发生分离：
- 面部遮罩相对于身体视频的脸部偏高（往上走）
- 眼珠相对于面部遮罩偏低（往下掉）
- 嘴部相对正常

### 诊断过程

**第一步：排除骨骼层级问题**（`[SkelDiag]` 日志）

添加日志后发现：骨骼共 7 个，全部是 `parent=null` 的根骨骼，`evalSkeletonFromMovable` 中不存在子骨骼被覆盖的问题。

```
[SkelDiag] skeleton.length=7, movableJoints=[0,1,2,3,4,5,6]
[SkelDiag] movable[5]=skel[5] parent=null trans=[1.76,159.10,16.88]  ← 右眼
[SkelDiag] movable[6]=skel[6] parent=null trans=[-4.10,159.06,16.97] ← 左眼
```

**第二步：发现运动幅度不一致**（`[JT]` 逐帧日志）

添加每 5 帧打印全部 7 个关节 Y 位移的日志后，发现关键规律：

```
f=25: j0:-0.29 j1:-0.08 j2:-0.16 j3:-0.24 j4:-0.40 j5:-0.79 j6:-0.97
f=30: j0:-0.32 j1:-0.12 j2:-0.19 j3:-0.26 j4:-0.42 j5:-0.85 j6:-0.96
```

各关节运动幅度对比：

| 关节 | Y (rest) | 最大 ΔY | 说明 |
|------|---------|---------|------|
| j1 | 139.58 | -0.12 | 下巴（运动最少）|
| j2 | 146.94 | -0.19 | 下脸部 |
| j3 | 151.34 | -0.26 | 中脸部 |
| j0 | 153.44 | -0.32 | 面部基准 |
| j4 | 154.74 | -0.42 | 上脸部 |
| **j5** | **159.10** | **-0.85** | **右眼 ← 2-3x！** |
| **j6** | **159.06** | **-0.97** | **左眼 ← 2-3x！** |

### 根本原因

面部追踪系统将**凝视方向（gaze）也编码在 j5/j6 的平移分量**中，而不是旋转分量。当头部运动时，j5/j6 的平移量 = 头部整体位移 + 凝视方向补偿，导致其运动幅度远超面部骨骼的 2-3 倍。

视觉效果：
- 面部皮肤（j0-j4 驱动）下移量 ≈ 0.3-0.4 单位
- 眼球网格（j5/j6 驱动）下移量 ≈ 0.8-1.0 单位
- 眼球相对面部皮肤多下移 ~0.5 单位 ≈ 屏幕上 4-6 像素

### 修复

**文件：** `src/utils/GLPipelineMP.ts`，`renderMesh` 中骨骼矩阵计算前加入修正：

```typescript
// 把 j5/j6 的平移量锚定到 j4（上脸骨）的运动幅度
// EYE_ANCHOR_JOINT=4：以上脸骨作为参考（最接近眼眶区域）
// EYE_EXTRA_SCALE=0.0：眼球不做额外的独立平移（完全锁定）
if (char.skeleton.length >= 7) {
    const EYE_ANCHOR_JOINT = 4;
    const EYE_EXTRA_SCALE  = 0.0;

    const initA = this.initSkeletonStatus[EYE_ANCHOR_JOINT].translation;
    const curA  = currentSkeletonStatus[EYE_ANCHOR_JOINT].translation;
    const dA = [curA[i] - initA[i], ...]; // anchor delta

    for (const eyeIdx of [5, 6]) {
        const initE = this.initSkeletonStatus[eyeIdx].translation;
        const curE  = currentSkeletonStatus[eyeIdx].translation;
        const dE    = [curE[i] - initE[i], ...];
        const extra = [dE[i] - dA[i], ...]; // gaze extra beyond anchor

        currentSkeletonStatus[eyeIdx].translation = [
            initE[i] + dA[i] + extra[i] * EYE_EXTRA_SCALE, ...
        ];
    }
}
```

---

## 可调参数（GLPipelineMP.ts）

当前代码中保留了三个可调常量，供后续微调：

```typescript
// ─── 调试用参数（位于 renderMesh 骨骼修正块）─────────────────────────────

// 全局运动放大：若遮罩整体偏高（浮在 body video 脸部之上），尝试 1.2 或 1.5
const GLOBAL_MOTION_SCALE = 1.0;

// 眼球锚定关节：4=上脸骨（推荐），0=面部基准骨
const EYE_ANCHOR_JOINT = 4;

// 眼球额外运动保留比例：
//   0.0 = 完全锁定（无凝视平移，推荐起点）
//   0.3 = 保留 30% 凝视动画（更自然但可能有轻微漂移）
//   1.0 = 不修正（还原原始行为）
const EYE_EXTRA_SCALE = 0.0;

// ─── NDC 空间面部偏移（位于 transform_2d_mat 计算处）────────────────────

// 若面部整体有固定偏移，可在此微调（+X=右，+Y=上，1.0 NDC = 画布半宽/半高）
const DEBUG_FACE_OFFSET_X_NDC = 0.0;
const DEBUG_FACE_OFFSET_Y_NDC = 0.0;
```

---

## 修改文件汇总

| 文件 | 修改内容 |
|------|---------|
| `src/utils/GLDeviceMP.ts` | 修复 `texImage2D` 浮点纹理内部格式（`gl.RGBA` → `gl.RGBA32F`） |
| `src/utils/DataInterfaceMP.ts` | `transformMJT()` 支持对象格式；四元数 XYZW→WXYZ 重排 |
| `src/utils/GLPipelineMP.ts` | 投影使用 `videoWidth/2` × `videoHeight`；添加 `width/height` 别名防 ReferenceError；眼球骨骼锚定修正；NDC 微调常量 |
