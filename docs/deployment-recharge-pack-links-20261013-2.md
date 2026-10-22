# 套餐点击入口缓存版本收尾

- 发布recharge-pack-links-20261013-2；基底为已发布-1的完整应用，只修正auth.html中credits-account.js缓存引用为20261013-pack-links-1。
- 原因：-1变更时旧引用实际为manual-recharge-1，替换layout-1未命中，公网检查发现并补齐。套餐点击/选择功能已由-1实现。
- 本地完整542通过3跳过，服务器545/545通过；公网/auth账号脚本和/recharge对应脚本引用均为新版本，服务active、ready.database=true。
- 包SHA256：f68eb16954dfaac3b6f40008380a1fd1d3d715712fa4931d86c8dd62a316b1e2，上传后相同；现有release-production.sh发布，无新增迁移，用户套餐和收款配置保留。
- 数据库备份：/opt/nikai-ai-backups/mariadb/nikai-ai-20261013-131608-2126122.sql.gz。

成功时间2026-10-13 13:16:16 +08:00；回滚快照：/opt/nikai-ai-backups/releases/previous-20261013-131507-recharge-pack-links-20261013-2。
