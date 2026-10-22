# 隐藏已验证账号邮箱验证卡片

- 发布 ID：`hide-email-20261015-1`
- 完成时间：2026-10-15 10:12:28（Asia/Shanghai）。
- 基底：已通过严格主机指纹校验的 `admin@47.93.245.219` 当前完整应用快照，排除配置密钥、数据库、用户数据及依赖目录。
- 变更：仅修改生产基底中的 `public/auth.js` 卡片显示条件、`public/auth.html` 脚本缓存版本，加入账号页面回归测试。没有发布工作区其他改动。
- SHA-256：`70895cbc9a5ea3ecd98244d5867b76cd4f98e10e3b0f6b781485ab5f9cbac9ef`，上传前后相同。
- 发布入口：服务器现有 `/opt/nikai-ai/scripts/release-production.sh`，发布历史状态 `success`。
- 回滚版本：`/opt/nikai-ai-backups/releases/previous-20261015-101102-hide-email-20261015-1`。
- 数据库备份：`/opt/nikai-ai-backups/mariadb/nikai-ai-20261015-101218-2211151.sql.gz`。
- 本地预检：Node 22.18.0；依赖安装、服务入口及 111 个前端脚本语法检查通过；全量测试 616 通过、3 跳过、0 失败；138 个图标校验通过。
- 服务器干净目录复检：619 项全部通过，没有迁移变更。
- 发布后服务 `active`，服务器就绪接口数据库状态为 true。
- 公网浏览器核验：`https://ontimo.cn/auth` HTTP 200，脚本版本 `20261015-hide-verified-email-1`、脚本 HTTP 200；就绪接口 HTTP 200 且 database=true。Windows curl 出现连接重置后，使用浏览器成功核实公网结果。
- 浏览器以模拟 auth/me 返回数据检查实际线上页面：已验证普通账号卡片不可见，未验证账号卡片可见；两种状态均无 pageerror。没有创建测试账号或修改真实用户数据。
- 临时文件清理命令被自动审批策略拒绝（blocked by policy），未执行；本机临时发布目录及服务器 /tmp 中本次两个发布归档暂时保留，不影响发布结果。
