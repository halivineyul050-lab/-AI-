# AI 生图创作台发布记录 · 2026-09-20

## 发布结果

- 线上地址：`https://ontimo.cn/image-generation`
- 发布版本：`ai-image-studio-20260920-1d14b1e`
- 发布提交：`1d14b1e`
- 发布时间：`2026-09-20T11:29:54+08:00`
- 回滚快照：`/opt/nikai-ai-backups/releases/release-20260920-112932-ai-image-stu.tgz`

## 变更内容

- 将原“即将上线”页面替换为紫色主题、居中式 AI 生图创作台。
- 支持提示词、快捷灵感、参考图、比例、风格和 1/2/4 张数量选择。
- 使用站内 SVG 素材模拟生成进度与结果，不调用外部生成接口。
- 演示结果支持下载、再次生成和送入画布。
- 基础画布支持本地图片上传、拖动、20%–240% 缩放、删除、五种比例切换和 PNG 导出。
- 桌面和手机端自适应，兼容明暗主题及减少动效设置。

## 验证证据

- TDD 聚焦测试：5/5 通过，覆盖页面结构、响应式样式、无网络生成、文件校验和画布编辑导出。
- 本地完整测试：158/158 通过，0 失败。
- 本地浏览器检查：模拟生成、结果渲染、送入画布和编辑控件可用；390px 手机视口横向溢出为 0；控制台无错误或警告。
- 生产发布测试：129/129 通过，0 失败。
- `nikai-ai.service` 与 Nginx 均为 `active`，健康接口返回 `status=ok`、`database=true`。
- 线上 `/image-generation`、`/image-generation.js` 和三张演示 SVG 均返回 HTTP 200。
- 线上 HTML 包含新标题与 `image-generation.js?v=20260920-2`，线上脚本包含画布控制器。
- 8 个发布文件 SHA-256 全部与本地一致。关键文件：

```text
image-generation.html  4e828bd818aa61605b606432ce982c7ef670296f27af70f4d6383f9d2c1c9a24
image-generation.css   1070be0ea94106a51bacef6ae8867836d2db03864975dbb8f3baa8203261f3c8
image-generation.js    5be84984e5dd290a38c79dd49491e6c133b5036398595bb9604ecdd7602a83b0
server.mjs             e810f376ab82cab03f917d4b924a58bb8fb558842c3bd820ee6e334fd4e058f3
```

## 发布与回滚

发布复用既有 SSH 通道与 `/opt/nikai-ai/scripts/release-production.sh`，发布脚本在切换版本前创建应用快照并在失败时自动恢复。

如需手动回滚，将回滚快照解压恢复到 `/opt/nikai-ai`，重新启动 `nikai-ai.service`，再检查 `/api/v1/health/ready`。

## 参考图预览修复

- 发布时间：`2026-09-20T13:18:22+08:00`
- 发布版本：`ai-image-preview-fix-20260920-b84180c`
- 修复提交：`b84180c`
- 回滚快照：`/opt/nikai-ai-backups/releases/release-20260920-131803-ai-image-pre.tgz`
- 根因：页面使用 `blob:` 地址显示本地参考图，但该页面的内容安全策略没有允许 `blob:` 图片。
- 修复：仅为 `/image-generation` 与 `/image-generation.html` 的 `img-src` 增加 `blob:`，后台及其他页面的策略保持不变。
- 验证：回归测试经历红灯后转绿；本地完整测试 158/158 通过；生产发布测试 129/129 通过；线上响应头已包含 `img-src 'self' data: blob:`；两个发布文件 SHA-256 与本地一致。
