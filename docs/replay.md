# sdk 用户行为重放

目前 sdk 通过socket下发的行为反馈数据驱动，服务端支持config传入参数replay，可回访用户行为的结果。无法回访用户行为，检测服务返回是否正常。鉴于此类场景，sdk提供了用户行为重放功能。根据存储的用户行为上行数据，在前端模拟用户操作，达到行为重放，以便排查bug。

## 获取重放数据

根据sessionId可在[服务端日志](https://pre-logserver.youyan.xyz/ttsa_backend_lite)查询到对应的数据，下载inputs.json.zip解压。

## 配置重放数据

在sdk demo的左侧功能区找到重放模式，并上传input.json（这里会修改config信息）。

## 启动重放

点击应用配置，会将config及input.json内的行为数据传递到sdk，在sdk启动之后会自动读取数据，模拟用户行为发送上行消息。

## 查看重放信息

打开游览器控制台，在 network(网络) -> socket(套接字) -> socket.io -> 消息 中可查看sdk发送的上行消息。

## 关闭重放

通过destroy即可销毁重放运行。在销毁后再次重启，上传新的文件或再次点击应用配置，即可启动新的重放。

## 注意事项

该过程中不要点击init或reload。这两个操作不会获取配置，且destroy会销毁sdk，导致重放数据丢失。
