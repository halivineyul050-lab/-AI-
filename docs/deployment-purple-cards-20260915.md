# 紫色卡片样式发布记录

- 版本：`purple-cards-20260915-3cecdfd`
- 生产发布时间：2026-09-15 11:00:37（北京时间）。
- 方式：沿用已授权 SSH 及 `/opt/nikai-ai/scripts/release-production.sh`，上传明确列出的 39 个文件，保留生产配置与数据库。
- 服务端基于实时下载的生产文件，仅补充共享 CSS、三个新增游戏资源及路由；未直接覆盖为本地服务器版本。
- 发布脚本完成数据库备份及代码快照，生产现有测试 107/107 通过。
- 39 个文件发布后 SHA-256 校验一致；应用与 nginx 为 active，数据库健康检查 ok。
- 经服务器本机 HTTPS 源站校验：首页、共享样式、账号、后台、工具、游戏、三个新增游戏及价格页共 11 个路径均 HTTP 200。
- 回滚快照：`/opt/nikai-ai-backups/releases/release-20260915-110022-purple-cards.tgz`。
- 公网复查：HTTPS 连接被重置，HTTP 仍为阿里云 `Non-compliance ICP Filing` 拦截页。代码已实际部署，公网访问仍需解决备案/接入问题。
