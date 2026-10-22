# PV / UV 图表悬停提示修复 — 2026-10-12

- 发布 `chart-hover-20261012-1`，13:21:45 +08:00 成功。
- 原提示已有取数事件，但 CSS opacity 恒为 0；修复未隐藏时可见，时间/PV/UV 三行显示。
- 以相邻点中线划分鼠标感应列，消除列间空隙；空数据或重绘时清理旧提示。
- 线上完整 661 文件基底，仅叠加 5 个审阅文件，完整包 662 文件；基底、上传、上线哈希均验证。
- 发布包 SHA256 `7287e261a83612f84d0884f366c0e5eb2cf1bcdf7c501c84a5e933c471402c2d`。
- 本地 467 项测试：464 通过、3 环境跳过、0 失败；服务器 467 全通过；138 Logo 校验通过。
- 浏览器验证原提示 opacity=0；修复后 hover 显示对应时间与 PV/UV，opacity=1，离开后隐藏，深色提示与浅色文本对比正常。
- 公网 admin.js、admin.css HTTP 200 且逐字匹配测试版本；服务 active、就绪 database=true、发布 history success。
- 代码回滚快照 `/opt/nikai-ai-backups/releases/previous-20261012-132043-chart-hover-20261012-1`。
- 数据库备份 `/opt/nikai-ai-backups/mariadb/nikai-ai-20261012-132136-2063789.sql.gz`。
