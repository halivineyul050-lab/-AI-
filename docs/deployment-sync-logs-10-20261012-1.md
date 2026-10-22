# 采集记录显示最近10条 — 2026-10-12

- 发布 `sync-logs-10-20261012-1`，13:26:19 +08:00 成功。
- 后台采集记录只渲染最近10条，标题明确显示；后台完整历史与今日新增统计保持原口径。
- 线上662文件基底，仅修改 admin-news-sync.js 与 admin.html 缓存版本；基底与上传包哈希验证。
- 包 SHA256 `4db0e3394ccf13bb8c3b3c3d8ecc77039cb0ee92e9a46f1809299600793da5a0`。
- 浏览器以50条记录验证只显示最新10条；本地467测试464通过3环境跳过0失败，服务器467全部通过，138 Logo通过。
- 公网脚本HTTP200逐字匹配测试版本；active、database=true、history success，线上两个文件哈希一致。
- 代码备份 `/opt/nikai-ai-backups/releases/previous-20261012-132516-sync-logs-10-20261012-1`。
- 数据库备份 `/opt/nikai-ai-backups/mariadb/nikai-ai-20261012-132610-2065937.sql.gz`。
