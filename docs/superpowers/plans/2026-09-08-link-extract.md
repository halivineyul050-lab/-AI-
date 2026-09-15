# 分享链接提取 Implementation Plan

**Goal:** 在现有小工具中交付本机分享链接解析与四类结果。
**Architecture:** 独立解析模块、受限网络下载、浏览器适配和原生音频导出；server.mjs 仅注册路由，前端原生页面。
**Tech Stack:** Node 22 WebSocket/HTTP、Chrome CDP、FFmpeg、原生 HTML/CSS/JS。

- [x] tests/link-extract.test.mjs：先验证分享 URL、平台目标匹配、视频/音频区别、域名与地址边界。
- [x] backend/link-extract-core.mjs：分享链接识别、平台响应归一化，禁止猜测水印状态。
- [x] backend/link-extract.mjs：CDP 后台页面、响应监听、短期票据、安全下载与音频转换。
- [x] link-extract.html/css/js、server.mjs、utilities.html：配置状态、输入、四类结果、下载和错误处理。
- [x] 真实链接验证、界面验证、音频导出、全套测试；文档记录本机依赖和平台未验证范围。

验收（2026-09-08）：71 项测试通过，独立审查无剩余阻塞问题。用户抖音作品 7676517073484352822 解析成功；视频 Range 下载返回 206 video/mp4，封面返回 image/jpeg；同一作品音轨导出 MP3，经 ffprobe 验证 2514.070930 秒、44100Hz、双声道。页面完成文案复制、音频取消/重试及完整 MP3 生成、390px 布局检查。小红书尚无真实样例，仅适配器测试通过；未宣称全视频文件已完整下载或小红书已实测。
中断恢复检查：预览服务已用最新代码重启；无效分享文本明确报错；测试中下载的中间音轨与页面调试副本已清理，保留实际 MP3 验收产物。
已验证 Chrome 关闭后重启的连接文件更新流程；工具无需手动更新 WebSocket 地址。
