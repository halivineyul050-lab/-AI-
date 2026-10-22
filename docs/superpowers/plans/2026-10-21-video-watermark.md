# Video Watermark Implementation Plan

**Goal:** 新增本地视频图片水印工具并上线。

**Architecture:** 使用当前生产完整快照隔离制作，复用 FFmpeg WASM worker；纯函数路径模块同时生成 Canvas 预览位置与 FFmpeg overlay 表达式。沿用现有页面导航、输入限制和视觉。

**Tech Stack:** 原生 ES modules、Canvas、FFmpeg WASM、Node test、Playwright。

## Constraints
- 默认 internal / .12 / .40，四种路径与技能一致，5% 边距。
- 无新增依赖；生产基底仅叠加本次文件；不发布工作区其他改动或敏感文件。

## Tasks
- [x] 写 tests/video-watermark.test.mjs：参数拒绝、四路径首尾、安全边距、纵横比速度、导出音频与透明度；先运行确认缺失模块失败。
- [x] 实现 public/video-watermark-core.js：route(mode)、buildWatermark(settings)、watermarkPosition(plan,time)、createWatermarkCommand(settings)，验证测试。
- [x] 实现 HTML/CSS/controller/worker：双素材选择，实时预览，宽度和透明度，四模式，导出取消与超时，结果和下载。
- [x] 注册 server.mjs 静态文件、canonical 路由、CSP 与 sitemap；utilities.html 新增入口。
- [x] 浏览器实测四模式、透明 PNG、有声/无声 MP4、参数改变、取消重试及移动端，检查导出真实媒体与像素。
- [x] 完整生产快照运行 npm ci、所有 JS 语法检查、npm test、npm run logos:verify。
- [x] 核验完整归档及 SHA-256，经 SSH 上传调用现有 release-production.sh，验证真实公网并记录备份与版本。
