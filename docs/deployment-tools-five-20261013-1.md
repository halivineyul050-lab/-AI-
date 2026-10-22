# 工具管理每页五条 — 发布记录

- 发布ID：tools-five-20261013-1；成功时间：2026-10-13T18:27:47+08:00。
- 基底：creator-layout-20261013-1，完整634文件，仅叠加admin.js、admin.html及缓存版本测试。
- 工具管理默认及每页5条，搜索、筛选、总数、翻页保留；其他内容类别维持20条。未改变数据库内容或前台工具列表。
- 本地568通过/3环境跳过，服务器571全部通过；语法与138个Logo验证通过。
- 浏览器真实测试管理员：首屏5条，总数28保留；下一页5条且内容不同，请求offset=5；切换分类limit=20，回工具limit=5/offset=0。
- 公网：admin加载新缓存版本，线上JS哈希与测试候选相同；service active，ready status=ok/database=true。
- 代码备份：/opt/nikai-ai-backups/releases/previous-20261013-182627-tools-five-20261013-1。
- 数据库备份：/opt/nikai-ai-backups/mariadb/nikai-ai-20261013-182738-2151535.sql.gz；无迁移。
- SHA256：9a1354aa84c828f21491faa6ca5e270db110db3ea2a03c2a5a2c0ee80539ff6d。
