# 资讯自动更新首次发布与回滚记录

发布 ID：news-auto-20261012-1；脚本记录成功时间2026-10-12T10:33:02+08:00。发布包SHA-256 db5dad34f31c0bdac542402109073f03ef9a2e1ee1a32de9af17fb0deb082627，660源文件，27审阅文件改动，服务器452项测试通过。

公网业务核验发现 /api/v1/site/bootstrap 与 /api/v1/news 返回500：新 news_sync_items 使用 utf8mb4_general_ci，旧 articles 使用 utf8mb4_unicode_ci，联表等号比较发生 Illegal mix of collations。健康接口仍为200，不能据此宣布功能成功。

按既有 /opt/nikai-ai/scripts/rollback-production.sh 恢复本次旧代码快照。2026-10-12T10:38:50+08:00手动回滚成功，公网Bootstrap恢复200。失败版本归档：/opt/nikai-ai-backups/releases/replaced-20261012-103846-2049308。原previous-20261012-103159-news-auto-20261012-1目录被回滚脚本恢复为活动目录。迁移024及数据保留，没有恢复数据库或删除用户内容。

首次发布数据库备份：/opt/nikai-ai-backups/mariadb/nikai-ai-20261012-103254-2048975.sql.gz；回滚前数据库备份：/opt/nikai-ai-backups/mariadb/nikai-ai-20261012-103846-2049320.sql.gz。

修复与最终验收见 deployment-news-auto-20261012-2.md。保留原始success和rollback历史，不将脚本成功等同于功能验收通过。
