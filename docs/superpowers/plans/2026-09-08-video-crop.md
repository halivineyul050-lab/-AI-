# 视频画面裁剪 Implementation Plan

**Goal:** 在现有站点完成用户已批准的本地视频画面裁剪工具。
**Architecture:** 原生 video + DOM 裁剪框 + canvas 实时预览；独立 Worker 内使用自托管 FFmpeg WASM 编码 MP4。
**Tech Stack:** JavaScript、CSS、Node test、@ffmpeg/core 0.12.10。

- [x] tests/video-crop.test.mjs：验证 fitCrop/moveCrop/resizeCrop/setCropSize 的比例、边界与偶数输出，以及 createCropCommand 音轨和裁剪参数；先运行失败。
- [x] video-crop-core.js：纯几何计算与安全命令构造。
- [x] video-crop-worker.js：加载编码器、写文件、编码/进度、读结果并传回；父页面控制超时/取消。
- [x] video-crop.html/css/js：文件选择、框交互、精确设置、实时预览、导出进度、错误恢复与 URL 清理。
- [x] utilities.html 和导航：GIF 与裁剪均可发现；server.mjs 精确路由、资源白名单、WASM MIME 与页面级 CSP；路由测试。
- [x] 真视频含音轨浏览器导出，ffprobe 验证；手机布局、取消和错误恢复；npm test 与 git diff --check；README 更新。


## 验证记录
2026-09-08：npm test 59/59 通过；git diff --check 无问题。浏览器载入 320x180、3秒、含正弦音轨的 H.264 测试视频，导出方形裁剪成功。最终精确设置120x120，ffprobe确认输出H.264视频120x120、3.000秒，AAC音轨3.018秒（编码帧补齐）。已验证比例预设、数字输入联动、裁剪框拖动、锁定比例键盘放大、取消后重试和390px窄屏无横向溢出。

复核修正：新增resizeCropByKey联动键盘两轴，避免锁定比例只能缩小；数字输入即时更新并保留编辑中内容；HTML脚本增加版本号避免旧缓存。独立审查未发现其他阻塞问题。

为独立解码读取浏览器输出，测试临时拦截createObjectURL并以FileReader取得Blob；刷新已清除，生产代码没有此测试钩子。内置浏览器下载落盘与实体iOS/Android未验证。FFmpeg源码和许可证记录在assets/vendor/ffmpeg/NOTICE.txt。
