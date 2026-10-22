# 生产备份与文件权限修复（2026-10-08）

- 发布 ID：`ops-hardening-20261008-1`；发布历史时间 `2026-10-08T10:59:10+08:00`，状态 `success`。
- 以当时线上完整版本为基底，仅叠加备份 service override、发布暂存权限整理代码及对应测试；通过已授权 SSH 上传完整发布包，SHA-256 `c3637f00aa2e3098579cb3bd87d687cebe099b42101ed850671cf86902cf0c3f`，调用服务器既有 `/opt/nikai-ai/scripts/release-production.sh`。
- 本机隔离目录测试 341 项中 338 通过、3 跳过；服务器发布预检 341 项全部通过。代码回滚快照：`/opt/nikai-ai-backups/releases/previous-20261008-105818-ops-hardening-20261008-1`。发布前 MariaDB 备份：`/opt/nikai-ai-backups/mariadb/nikai-ai-20261008-105902-1929071.sql.gz`。
- 修复后的 `nikai-db-backup.service` 由 root 执行现有数据库引擎选择器；发布流程实际启动服务一次，结果 `success`、退出码 0。此次定时服务验证备份：`/opt/nikai-ai-backups/mariadb/nikai-ai-20261008-105907-1929139.sql.gz`；`gzip -t` 通过，SHA-256 与旁路摘要文件一致。
- 除用户数据目录外，线上应用文件 world-writable 数量从 595 降至 0；`server.mjs` 为 `644`，备份脚本为 `755`，`.env` 仍为 `640`，`.mariadb.cnf` 仍为 `600`。
- `nikai-ai.service` 为 `active`；本机和公网就绪接口均返回 `status=ok`、`database=true`；公网首页与生图页为 HTTP 200。
