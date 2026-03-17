# 魔珐星云3D虚拟人 JS-SDK

#### 初始化参数

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| containerId | string | 是 | 容器元素ID |
| appId | string | 是 | 数字人appId（从业务系统获取）|
| secretId | string | 是 | 数字人secretId（从业务系统获取）|
| gatewayServer | string | 是 | 数字人服务接口地址 |
| onWidgetEvent | function | 否 | Widget事件回调函数 |
| enableRecording | boolean | 否 | 是否启用录屏功能，默认为false |

### 录屏功能

SDK提供了录制功能，可以录制虚拟人的表现内容。

#### 启用录屏

在初始化SDK时，通过`enableRecording`参数启用录屏功能：

```javascript
const LiteSDK = new XmovAvatar({
  containerId: '#sdk',
  appId: '123',
  secretId: '123',
  gatewayServer: 'http://192.168.88.101:32607',
  enableRecording: true  // 启用录屏功能
});
```

#### 导出录制内容

使用`exportRecording`方法导出录制的视频：

```javascript
// 导出录制的视频内容
const videoBlob = await LiteSDK.exportRecording();
if (videoBlob) {
  // 创建下载链接
  const url = URL.createObjectURL(videoBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'virtual-human-recording.mp4';
  a.click();
  URL.revokeObjectURL(url);
}
```

注意事项：
1. 录屏功能需要用户授权，用户可能会拒绝授权请求
2. 录制的视频格式为MP4，帧率为24fps，码率为2.5Mbps
3. 录制会在调用`start()`方法时自动开始，在调用`stop()`或`destroy()`方法时自动结束
4. 如果未启用录屏功能，`exportRecording()`方法将返回null 