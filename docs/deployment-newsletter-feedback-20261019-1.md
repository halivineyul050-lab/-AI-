# 周报订阅结果提示修正

- 发布版本：`newsletter-feedback-20261019-1`，2026-10-19 10:23:30 +08:00，发布历史 `success`。
- 以线上 `admin-model-discovery-20261016-1` 完整应用快照为基底，仅修改 `public/app.js` 的订阅处理、`public/index.html` 订阅说明及资源版本、`server.mjs` 订阅响应提示，新增 `tests/newsletter-feedback.test.mjs`。未携带本地其他改动，无依赖或迁移变更。
- 成功明确提示订阅成功及每周一发送、不立即发送邮件；重复有效订阅说明无需重复；已退订或压制状态不再误报成功，并保留表单。没有更改退订后重新激活规则。
- 通过已授权 SSH 和服务器原有 `release-production.sh` 发布。发布包 SHA-256：`7440fe79b608493d00ea6f5180844ddff756a7ab4193690b2ddb17a1ee21d8c3`，上传前后匹配。
- 本地 Node v22.18.0：完整测试 747 项，744 通过、3 平台跳过、0 失败；服务器同版本 747 项全部通过。JavaScript 语法检查和 138 个 Logo 校验通过。此前脏工作区的迁移数量不匹配未出现在本次生产基底中，未修改或跳过相关测试。
- 代码回滚快照：`/opt/nikai-ai-backups/releases/previous-20261019-102002-newsletter-feedback-20261019-1`。
- 数据库备份：`/opt/nikai-ai-backups/mariadb/nikai-ai-20261019-102318-2369555.sql.gz`。
- 服务 `active`，服务器健康正常。真实 Chrome 访问公网，页面引用 `/app.js?v=newsletter-feedback-20261019-1`；公网健康接口 HTTP 200、`database=true`。四种订阅响应的浏览器提示断言通过，控制台无页面脚本错误；测试拦截订阅 POST 响应，未创建真实订阅、未发送邮件。Windows curl 公网 TLS 连接被重置，公网结果使用真实 Chrome 请求独立核验成功。
- 清理本次临时目录、下载文件及安装进程的命令被自动审批策略拒绝（`blocked by policy`），未换工具绕过。临时目录保留在 `C:\Users\zhanglian2\AppData\Local\Temp\nikai-newsletter-feedback-20261019`、`nikai-newsletter-original-20261019`、`nikai-node-22-18-20261019`、`nikai-verified-node-2218`；相关同前缀临时文件及服务器 `/tmp/nikai-newsletter-base*-20261019.tgz` 暂留，不影响已验证的线上服务。
