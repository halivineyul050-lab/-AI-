# 视频水印工作台样式优化

- 发布：`watermark-style-20261021-1`，2026-10-21 17:02:14 +08:00。
- 页面：`https://ontimo.cn/utilities/video-watermark`。
- 基底：线上完整 `watermark-preview-fix-20261021-1`，仅覆盖 `public/video-watermark.html` 与 `public/video-watermark.css`，保留现有预览、编码兼容和导出逻辑。
- 包 SHA-256：`b0ac19f99b5be5eef05159af0bcdbf6bc8cb85d6af670f28c87a3555be4d1c4f`，上传前后一致；888 个应用文件，排除真实配置、用户数据、数据库、依赖目录，保留 `.env.example`。

## 改动

主容器居中，最大宽度 1680px；预览为主、设置栏固定宽度。修复公共样式覆盖导致的 300px 上传大框，桌面改为 104px 横向上传卡片，手机为 82px。统一标题、间距、参数数值、播放控件和结果区；设置栏桌面吸顶，900px 以下单列。样式限定于水印页，不影响其他工具。

## 验证

- Node 22.18.0 语法检查通过；本地首轮有 1 项其他页面测试在 `browser.newPage` 前浏览器退出，未跳过或修改测试。对应文件单独重跑 3/3 通过，完整重跑 885 项中 882 通过、3 项原有 Linux 专用测试跳过、0 失败；138 个标识资源通过。
- 服务器正式脚本干净目录 885/885 通过，零跳过、零失败，备份切换成功。
- 公网 CSS：`/video-watermark.css?v=20261021-style-1`。2560px 主体左右各 440px、1440px 各 40px、390px 各 16px，均无横向溢出；上传高度分别 104/104/82px。
- 明暗主题、横竖视频、手机布局检查通过。公网 Chrome 实际点击播放，进度到 0.4/3.0 秒，导出下载成功，下载 MP4 完整解码通过，无 pageerror。
- 服务 active；服务器与公网浏览器就绪 HTTP 200、`database=true`；release history 为 success。

## 回滚与证据

- 数据库备份：`/opt/nikai-ai-backups/mariadb/nikai-ai-20261021-170201-2577042.sql.gz`。
- 代码快照：`/opt/nikai-ai-backups/releases/previous-20261021-165542-watermark-style-20261021-1`。
- 截图、布局测量、两轮本地日志及服务器日志：`docs/watermark-style-evidence-20261021/`。
- 系统 Temp 发布暂存目录按此前递归删除策略约束保留，未改用其他删除通道；浏览器和本地验证服务已关闭。发布包不含本地测试数据库。
