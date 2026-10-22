# 套餐卡直达对应充值

- 发布recharge-pack-links-20261013-1；基底recharge-jpeg-20261013-1，仅六文件变化：auth.html、credits-account.js、credits.css、recharge.html、recharge.js、recharge-ui.test.mjs。
- 账号积分区套餐卡改为完整可点击链接/recharge?package=套餐ID，提供hover/focus反馈。充值页按服务器有效套餐ID选中对应radio；失效ID回退首个套餐。登录next保留选择。
- 查询参数只表达套餐ID，金额和积分仍来自后台；不自动创建订单或改变套餐配置。
- 浏览器四档starter/standard/premium/large逐一点击后URL与选中项匹配；匿名登录next保留large；无页面错误。
- 本地完整542通过3跳过；服务器545/545通过；定向15/15，语法和138logo校验通过。新增测试覆盖匹配套餐、忽略URL价格参数、未知套餐回退。
- 包SHA256：5e9d575b7c4cda09bfe36e91a963a029414a6ef7a89a6d3f736ae558fd235837，上传后相同；现有release-production.sh发布，无新增迁移，生产套餐/收款配置保留。
- 数据库备份：/opt/nikai-ai-backups/mariadb/nikai-ai-20261013-131104-2123783.sql.gz。
- 首次公网检查发现/auth账号脚本仍引用旧缓存版本；账号脚本内容和充值页功能已更新，服务active，ready.database=true。该缓存版本由后续recharge-pack-links-20261013-2修正。

成功时间2026-10-13 13:11:13 +08:00；回滚快照：/opt/nikai-ai-backups/releases/previous-20261013-131001-recharge-pack-links-20261013-1。
