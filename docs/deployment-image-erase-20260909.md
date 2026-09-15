# 图片物体消除：部署与验收

2026-09-09 已实现 `/utilities/image-erase`，入口在“小工具”。支持画笔、矩形、选区橡皮擦、笔刷大小、撤销/重做、清空选区、显示缩放、恢复原图、前后比较、连续消除和 PNG 下载。

## 运行边界

- PNG/JPEG/WebP/BMP 原文件至多 20MiB；工作图最长边 2048px、短边至少 16px。超大图片等比缩小并显示实际输出尺寸。
- 图片上传本站服务器处理；CPU LaMa 按选区带背景裁切，推理最长边 512px，再回贴工作图。选区外像素不变，保留透明信息。复杂背景可能留下修复痕迹。
- 同时只运行一个任务；120秒处理超时。超时/取消杀死子进程，等待退出后删除临时文件、释放槽位。选区覆盖达到85%时拒绝，要求分多次处理。
- JSON 请求上限28MiB，PNG图片18MiB、选区2MiB；反向代理该接口读取超时150秒。
- `GET /api/utilities/image-erase/status` 返回服务状态；`POST /api/utilities/image-erase` 接收 `{image,mask}` PNG data URL，成功返回 image/png，失败沿用站点问题响应 `{code,title,status}`。

## 服务器

- 47.93.245.219：2 CPU、3563MiB RAM，Alibaba Cloud Linux 3；无 GPU。
- 应用 `/opt/nikai-ai`，服务 `nikai-ai.service`，使用既有 nikai 用户与 PrivateTmp。
- 独立 Python3.11 venv：`/opt/nikai-image-erase/venv`，PyTorch2.5.1+cpu；其余锁定版本见 `scripts/image-erase-requirements.txt`。
- 环境参数：`NIKE_ERASE_PYTHON=/opt/nikai-image-erase/venv/bin/python`、`NIKE_ERASE_MODEL=/opt/nikai-image-erase/big-lama.pt`。
- 模型来源、SHA256和许可证见 `assets/vendor/lama/NOTICE.md`。模型约197MiB，服务器独立安装，不发送浏览器。
- 安装步骤：安装系统 Python3.11/pip、创建上述 venv；从 PyPI 安装 requirements 文件，再从 `https://download.pytorch.org/whl/cpu` 安装 `torch==2.5.1 --no-deps`；运行 pip check。下载模型后核对 NOTICE 中 SHA256，配置上述环境变量，重启应用。保留模型与运行目录可被 nikai 读取执行的权限。
- nginx `/etc/nginx/conf.d/funai.conf` 添加该 POST 路由的独立 location，沿用既有同源代理及 Host/X-Real-IP 设置。

## 验收证据

- 本机与服务器 Node 全套74项通过；Python4项通过，包括选区外像素、透明度、尺寸与空/全选区拒绝。
- 浏览器实际选图、矩形选区、撤销重做、消除、查看处理前/后及下载通过；已检查窄屏和桌面布局。
- 两张模型测试图，选区外像素逐像素完全相同，选区内分别有13810和4639个像素改变。Windows中文模型路径使用文件对象加载解决了 PyTorch 路径错误。
- 服务器 CLI 测试：640×420 图，10.53秒，峰值675340KiB，无交换页；HTTPS 源站真实 POST 返回200、10.97秒，图片尺寸一致、选区外完全相同、选区内发生变化。
- 源站页面/JS/CSS/status 均200；服务和 nginx active；处理结束后私有临时目录没有 nikai-erase-* 残留。
- 部署完成 2026-09-09T11:00:13+08:00，release `image-erase-20260909`。
- 应用快照 `/opt/nikai-ai-backups/releases/release-20260909-105958-image-erase-.tgz`。
- 本次文件、环境及 nginx 备份 `/opt/nikai-ai-backups/releases/image-erase-20260909-105958`；环境备份目录权限700、文件600；线上 .env 保持640。

## 尚存的公网访问限制

源站 HTTPS 验证通过 curl `--resolve ontimo.cn:443:127.0.0.1` 完成，验证了证书与 nginx 路径，没有禁用证书校验。它不代表外网域名已恢复。
同日从本机访问公网域名，HTTP仍为403备案拦截，HTTPS连接被重置。这是既有公网接入问题，此次工具发布未解除该限制。

## 2026-09-09 样式统一
图片消除页改为直接加载主页面 styles.css，共用紫色渐变品牌色、字体、浅灰页面背景、圆角阴影和 site-header/site-nav。编辑器继续使用独立样式，避免改变其他工具；明暗主题共用 nike-theme 设置。修改 HTML/CSS/JS 三个文件并同步服务器，旧文件备份 `/opt/nikai-ai-backups/releases/erase-style-20260909-111136`。服务器脚本语法检查、主样式引用及服务状态通过。
