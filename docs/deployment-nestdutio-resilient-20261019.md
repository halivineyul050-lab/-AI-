# NeStudio 分文件生成与断点继续发布记录

- 发布 ID：`nestdutio-resilient-20261019-1`
- 上线时间：2026-10-19 18:13:55 +08:00
- 基底：线上完整版本 `explainer-projects-20261019-1`；仅叠加 reviewed-files.json 中审阅过的文件。未包含工作区其他改动、真实配置、数据库或用户内容。
- 发布包 SHA-256：`8fcaf527e52a7e80993b7a657e339957fa76e4b70445f1e2f425574d6f2d2f3f`，上传后摘要一致。
- 正式脚本：服务器现有 `/opt/nikai-ai/scripts/release-production.sh`，退出 0，release history 为 success。
- 代码回滚快照：`/opt/nikai-ai-backups/releases/previous-20261019-180904-nestdutio-resilient-20261019-1`
- 数据库备份：`/opt/nikai-ai-backups/mariadb/nikai-ai-20261019-181343-2414150.sql.gz`

本次将新规划协议改为文件清单与逐文件生成，完整文件及时保存；输出被截断只对当前文件完整重试一次。仍失败时保留检查点，页面显示真实文件数量、当前文件与失败位置，符合版本、配置和有效期要求时可确认计费后继续。继续执行复用完整文件，仅生成缺失文件；成功后仍经过现有真实浏览器验收。新增迁移 041，检查点有效期 30 天，增加所属用户校验和重试幂等保护。

验证：本地 Node 22.18.0 全量 794 项，791 通过、0 失败、3 项 Windows 平台跳过；服务器干净环境 794/794 通过，无跳过。JavaScript 语法检查与 138 项 logo 核验通过。故障注入集成测试实际验证截断、保留 HTML、继续仅补 app.js、浏览器按钮交互、失败退款与成功扣费。独立审查通过。既有迁移断言随版本更新，视频测试仅修正 seek 后取帧同步，原验收阈值保持。

公网 `https://ontimo.cn/nestdutio` 引用 `20261019-resilient-1`；JS/CSS 与健康接口均 HTTP 200，database=true。服务 active。390px 无横向溢出，pageErrors 为空；未登录继续接口返回 401。MariaDB 已应用 41/nestdutio_checkpoints，两张新表存在。证据保存在 [发布核验目录](nestdutio-resilient-evidence-20261019/)。

限制：发布前失败且没有检查点的旧任务需要重新提交。旧无清单协议兼容保留。没有使用真实收费模型做线上生成，不据此承诺所有上游模型均不会截断。第一版不自动拆模块或拼接截断 JSON。

清理：自动审批策略拒绝临时发布目录的递归删除，未尝试绕过。`C:/Users/zhanglian2/.codex/release-staging/nikai-resilient-20261019` 及本次临时发布文件保留，不影响线上运行。
