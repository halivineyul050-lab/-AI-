# 注销积分关联清理发布记录

- 发布 ID：`account-delete-20261020-1`
- 成功时间：2026-10-20 11:24:17（Asia/Shanghai）
- 生产目标：`https://ontimo.cn/`；`admin@47.93.245.219`
- 生产基底：`compare-layout-20261020-4`；下载归档 SHA-256 为 `2aa955e48118792a0c39e4591c984d402335e29503edaafe4ac3268f2d790277`，本地与服务器一致。
- 变更：仅替换 `backend/database.mjs` 中的 `deleteUserAccount`，更新 `tests/auth.test.mjs` 的注销 API 回归测试，新增 `tests/account-deletion-credits.test.mjs`。逐文件摘要比对确认其他生产文件未被本地工作区替换。
- 行为：事务内先验证账号可删除，MariaDB 锁定用户行；按依赖顺序删除生图任务及积分预占、派发、流水、赠送领取、首购标记、钱包；清除兑换码用户关联并禁用已使用兑换码；最后删除用户。失败整体回滚，保留超级管理员保护。
- 完整包 SHA-256：`e7707b24d5472e6a77b656e4c9f73171ad1fafd371150d49bc176521b2629ea2`，上传前后相同；排除真实环境配置、数据库、用户内容和依赖，保留 `.env.example`。
- 本地 Node v22.18.0：安装、服务与前端脚本语法检查通过；804 项测试，801 通过、3 原有跳过、0 失败；138 个图标校验通过。
- 服务器现有 `/opt/nikai-ai/scripts/release-production.sh`：干净目录 804 项全部通过，0 跳过、0 失败。
- 数据库迁移：无新增。
- 数据库备份：`/opt/nikai-ai-backups/mariadb/nikai-ai-20261020-112403-2464101.sql.gz`
- 回滚快照：`/opt/nikai-ai-backups/releases/previous-20261020-111819-account-delete-20261020-1`
- 发布历史：本次 `success`；服务 `active`，服务器就绪接口数据库状态为 true。
- 真实 MariaDB 验证：在未提交的外层事务中创建合成账号、钱包、赠送记录、流水及派发记录；通过保存点调用部署后的正式注销函数，确认账号及关联记录均归零；最后回滚整个外层事务。未使用或删除真实用户。
- 公网浏览器验证：就绪接口 HTTP 200、`database=true`；未登录调用 `DELETE /api/v1/account` 返回 401。Windows curl 曾遇 TLS 连接重置，后使用真实浏览器访问验证成功。
- 证据目录：`docs/account-delete-release-evidence-20261020/`，包含完整测试、安装、素材校验、服务器发布日志、真实 MariaDB 验证脚本与日志、公网验证 JSON。
