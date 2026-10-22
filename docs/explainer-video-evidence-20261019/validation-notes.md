# 视频导出验证
- 本地 Node 22.18.0 全量：772 项，769 通过、3 个平台跳过、0 失败；全量日志见 local-tests.log。
- 全部 public JS/MJS 与 server.mjs 语法检查通过；logos:verify 138 条资源一致。
- 真正通过页面点击下载 MP4，再读取下载文件重新解码：1280×720、约15秒、首中尾画面不同；不是仅检查 Blob 类型。截图 exported-frame.png 来自下载视频的第6秒。
- WebM 回退真实编码并播放至结尾：720p，约5秒。
- 导出期间不改变当前步骤或 SVG；取消后可重试；绘图样式503失败显示明确原因且可重试；移动端390px无横向溢出；无浏览器脚本错误。
- 新增模块为同源静态资源；只为讲解页面增加 blob 图片/媒体权限，未开放脚本 blob 权限，也不要求录屏、相机或麦克风。
- 准备画面样式请求限时20秒，单帧绘制10秒，录制总时长额外30秒看门狗；隐藏页面会取消并解释原因。视频最长600秒、100MB。
- 编码能力检测依据浏览器 MediaRecorder.isTypeSupported 与 canvas.captureStream，参照平台 API 文档：https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static 。真实编码测试覆盖能力检测后仍可能发生的错误。

- 第一轮服务器完整预检：771通过、1失败（沙箱浏览器无法写入 root 创建的下载目录），线上保持原版本。修复专用测试下载目录后，Linux隔离探针 MP4/WebM 通过，Windows最终目标测试5/5通过。未跳过测试或禁用沙箱。

- 第二轮服务器全量772/772通过并成功切换；公网真实下载心脏讲解MP4重新解码验证通过，见public-verification.log。
