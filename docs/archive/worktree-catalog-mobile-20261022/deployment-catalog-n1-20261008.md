# 发布记录：工具列表批量关联查询

- 发布 ID：`catalog-n1-20261008-1`
- 时间：2026-10-08 13:08 CST
- 范围：`backend/database.mjs` 对工具列表的关联数据改为按页批量查询；新增 `tests/list-tools-batch-hydration.test.mjs` 回归测试。每页关联查询由 4N 次降至固定 4 次（N 为当前页工具数）。无依赖或数据库迁移变更。
- 发布包 SHA-256：`b389b9be81603a19ac0edd4677542955ae9239c3b287ca29249c8f77f3d9b100`
- 验证：服务器发布预检 344/344 通过；npm audit 0 漏洞；服务 `active`；生产机 HTTPS readiness 返回 200 且 `database=true`；工具列表 API 与首页均返回 200。
- 数据库备份：`/opt/nikai-ai-backups/mariadb/nikai-ai-20261008-130813-1934148.sql.gz`（4.1M）
- 回滚快照：`/opt/nikai-ai-backups/releases/previous-20261008-130729-catalog-n1-20261008-1`
- 发布历史：`/opt/nikai-ai-backups/releases/release-history.log` 记录本次发布为 `success`。
