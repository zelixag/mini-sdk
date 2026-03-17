# 有灵离线数字人 JS-SDK

## 开发模式

use `pnpm`

- 根目录和 `app/`目录安装 packages:

```bash
pnpm install
cd app/ && pnpm install
```

- 根目录启动 SDK 实时编译：

```bash
pnpm sdk
```

- 根目录启动 Demo 应用:

```bash
pnpm app
```

浏览器访问 `http://localhost:5173`

## 更新日志

## SDK文档

[有灵Lite&Pro 数字人驱动 SDK 使用说明](https://rsjqcmnt5p.feishu.cn/wiki/BXOqwE0PtiduRxk79R9crAtwnRh)

## sdk分支管理

- feature：基于develop分支切出自己的开发分支，分支命名可以携带当前迭代版本号+需求名称英文，可以本地开发调试，构建demo，更新oss的demo，不做打包发布操作。
- develop：开发分支，需求可以从develop分支切出来自己的feature分支进行开发，开发完成后，上星云的test环境可以合到develop分支，进行打包发布。版本为alpha版本。
- release：test测试通过，星云发布pre，需要从develop合并到release分支。然后打包发布。pre修复bug使用beta版本进行发布。
- master：星云pre测试完成无问题，上线后，需将release代码合并至master。正式版本发布需团队沟通通过。

## sdk发布流程

- 更新 changelog.md 增加版本号+描述当前修改的内容及修复的问题
- 更新 package.json 内的版本号
- 执行 npm run build 构建
- 执行 npm publish 发布
- 通知星云发布 test/pre 环境
- 更新 oss sdk 静态包（xmovAvatar  index.umd）
- 执行 npm run lite
- 更新 oss sdk 静态包（LiteAvatar）

[test发布记录](https://rsjqcmnt5p.feishu.cn/docx/IvQZdW3IIo7pF6xFvcCcGfG2nxd)
[pre发布记录](https://rsjqcmnt5p.feishu.cn/docx/IthldRw5ioE7eAxUNeycauYpnuf)
