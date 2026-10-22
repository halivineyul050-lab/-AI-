# 后台导航分组折叠：生产发布

- 发布版本：admin-nav-groups-20261016-1；成功时间2026-10-16 16:07:55 +08:00。
- 基底：当前生产nestudio-credits-20261016-1完整归档，核验SHA后仅叠加manifest所列6个审阅文件。
- 发布包SHA256：9f56a08fdb298a2d86b8ed5f2bd830867739dc2178566fc01c9446f42cff467a；SSH上传后摘要一致。
- 唯一发布入口：/opt/nikai-ai/scripts/release-production.sh。
- 代码备份：/opt/nikai-ai-backups/releases/previous-20261016-160447-admin-nav-groups-20261016-1。
- 数据库备份：/opt/nikai-ai-backups/mariadb/nikai-ai-20261016-160744-2284160.sql.gz；本次无迁移。

## 功能与验收

数据监控、内容运营、充值与积分、系统配置独立展开/折叠，使用原生details/summary，支持键盘操作。首次打开仅展开当前分组；localStorage保存各组状态，深链和历史导航自动打开目标分组。移动端两列排列，短横屏导航限制高度并内部滚动，末组仍可到达。

浏览器回归覆盖独立开关、Enter、刷新持久化、hash定位、390px手机及740×360横屏全展开。独立审阅发现的横屏遮挡问题已修复并通过回归，无剩余问题。

本地全量732项：729通过、3项Windows跳过；Linux发布干净目录732/732通过，0失败0跳过。JS语法、138项logo校验通过。根工作区仅同步本次局部变更，相关16项测试通过。

正式发布history记录success，nikai-ai.service为active，公网和回环健康接口200且database=true。真实公网/admin包含四组details/summary，JS/CSS缓存版本20261016-nav-groups-1；获取线上资源确认状态持久化逻辑及移动端高度限制均已生效。
