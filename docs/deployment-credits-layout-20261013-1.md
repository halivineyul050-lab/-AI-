# 账号积分面板排版

- 发布：credits-layout-20261013-1，2026-10-13；基底 image-credits-20261013-1。
- 范围仅四个文件：auth.html、credits.css、credits-account.js、credits-ui.test.mjs。余额与兑换左右分栏，套餐显示名称/金额/积分，明细按列排列；手机单列及双列套餐、深色模式、焦点样式。
- 本地完整测试517通过3跳过；服务器520/520通过；JS语法及138个logo校验通过。真实浏览器1440/390无横向溢出，余额2020及三条明细正确，兑换失败反馈及按钮恢复通过，无页面错误。
- 包SHA-256：de4451f8dc1cbd90ed5bf60570544eb6278b0e238484a516323d6b4c77069cf8，上传摘要一致；690个完整应用文件，仅上述四个变化，无真实配置/数据库/用户内容。
- 通过服务器现有release-production.sh发布，未改变账务或数据库结构；备份数据库 /opt/nikai-ai-backups/mariadb/nikai-ai-20261013-101538-2108103.sql.gz。
- 公网服务active、就绪接口database=true；auth.html与积分CSS/JS200且包含20261013-layout-1与新版布局标记。
- 成功时间：2026-10-13 10:15:47 +08:00；回滚代码快照：/opt/nikai-ai-backups/releases/previous-20261013-101437-credits-layout-20261013-1。
