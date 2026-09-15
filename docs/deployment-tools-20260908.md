# 2026-09-08 小工具生产发布记录

## 发布结果

- 目标：47.93.245.219，`/opt/nikai-ai`，服务 `nikai-ai.service`。
- 版本：`tools-20260908`，服务器记录成功时间 2026-09-08 18:49:34 +08:00。
- 发布命令：`bash /opt/nikai-ai/scripts/release-production.sh /tmp/nikai-release-tools-20260908.tgz tools-20260908`。
- 242 个代码/资源文件；排除数据库、环境配置、凭据、报告和临时产物。归档的普通文件权限为 0644，Shell 脚本为 0755。
- 发布包 SHA-256：`9d5e6d086be313c590f8e16d89c379be62e57ad4f839319d84ed814bc7b53dcf`，上传后校验一致。
- 服务器运行 `node --check server.mjs` 及完整测试，71/71 通过；发布脚本返回 `Release completed: tools-20260908`。

## 备份与恢复

- 数据库备份：`/opt/nikai-ai-backups/sqlite/nikai-ai-20260908-184922.sqlite.gz`。
- 程序快照：`/opt/nikai-ai-backups/releases/release-20260908-184922-tools-202609.tgz`。
- 历史：`/opt/nikai-ai-backups/releases/release-history.log`。
- 需要回滚时：`bash /opt/nikai-ai/scripts/rollback-production.sh /opt/nikai-ai-backups/releases/release-20260908-184922-tools-202609.tgz`。
- 本次未覆盖 `.env` 和生产数据库；`.env` 权限仍为 0640。

## 验收证据

- 应用与 Nginx 均为 active；数据库就绪接口返回 `status: ok`。
- 源站 `/`、`/favorites`、`/utilities`、三个视频编辑工具及分享链接提取页面均为 HTTP 200。
- 三个 Worker 均为 HTTP 200；FFmpeg WASM 返回 `application/wasm`，长度 32,232,419 字节。
- 源站 HTTPS：使用 `--resolve ontimo.cn:443:127.0.0.1` 验证证书及实际反向代理，`https://ontimo.cn/utilities` 返回 200；HTTP 返回 301。
- `nginx -t` 通过，80/443 正常监听。
- 线上 server.mjs SHA-256：`f465d30dd45aa89e5e57917831059aa91a136a1d561e3253491e3163c7c18c77`。
- 线上 WASM SHA-256：`9f57947a5bd530d8f00c5b3f2cb2a3492faa7e5d823315342d6a8656d0a6b7b7`。

## 尚存限制

1. 发布前后公网 `http://ontimo.cn/` 返回 403，内容为阿里云 `Non-compliance ICP Filing` 页面；公网 HTTPS 连接被重置。源站 HTTPS 正常，公网访问问题需处理云平台的域名备案拦截，不能以应用部署成功宣称公网已恢复。
2. 分享链接提取目前是本机 Chrome 模式，公网接口按设计返回 `local_only`。本次发布了页面和代码，没有暴露个人浏览器或开放公网解析服务。GIF、裁剪、马赛克与模糊功能在浏览器内运行，不依赖此模式。
3. GitHub 部署 Secrets 为空，自动部署通道仍未配置；本次通过已授权 SSH 手动运行现有发布脚本。

没有在项目文件或发布包中保存登录密码。

## 2026-09-09 文件选择窗口置灰修复

用户明确反馈：点击选择视频后，操作系统文件窗口内的文件置灰。三个工具的文件输入原来都设置了 `accept="video/*,.mp4,.webm,.mov,.m4v"`，系统文件类型映射可能将视频排除在可选范围之外。移除 GIF、裁剪、遮挡工具的文件选择筛选，保留页面现有文件类型、大小及解码校验。

验证：浏览器三个页面的输入均无 accept 限制；裁剪工具选择 3 秒 H.264/AAC 测试视频后导出按钮正常启用，MP4 导出完成并触发下载。用户另一台电脑的原始文件尚未实测，编码不受浏览器支持时仍会有明确读取错误。

已逐个原子替换服务器三个 HTML 文件，替换前验证仅包含此次筛选移除并备份。源站三个实际路由均检查通过，服务 active。备份：`/opt/nikai-ai-backups/releases/file-picker-20260909-101348`。公网域名此前的备案拦截以及链接提取的本机限制不属于此次修复。
