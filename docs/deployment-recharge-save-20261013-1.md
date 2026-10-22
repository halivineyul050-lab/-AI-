# 充值渠道保存流程修复

- 发布recharge-save-20261013-1，基底manual-recharge-20261013-1。三文件变化：admin.html、admin-recharge.js、新增recharge-config-save.test.mjs。
- 根因：选择文件不会自动上传；单独上传后loadConfig重建表单，丢失尚未保存的收款人/启用勾选；未上传图片直接保存被后台正确拒绝，提示位于表单上方不易察觉。
- 修复：保存时先校验启用渠道的收款人和所选/已存二维码，再自动上传图片并提交配置；独立上传保留全部表单输入，只刷新图片；按渠道报告缺项；提示移至保存按钮附近；缓存版本20261013-save-2。
- 浏览器实测：初始空配置仅选择图片+填写名称+勾选启用，直接保存后支付宝ready=true；独立上传保留修改后的名称与勾选；误启用微信提示具体缺少收款人，无页面错误。
- 本地完整测试538通过3跳过；服务器541/541通过；定向9/9通过，JS语法与138logo校验通过。
- 发布包SHA256：40c2af3ea5ff05decad5ef01afb1695852412de254252f095939115f189088d9，上传后相同；现有release-production.sh发布，无新增数据库迁移。
- 数据库备份：/opt/nikai-ai-backups/mariadb/nikai-ai-20261013-113752-2116031.sql.gz。
- 生产配置未改写，用户需自行上传真实二维码并启用。公网admin引用新版本，JS含一键保存逻辑，服务active且ready.database=true。

成功时间2026-10-13 11:38:00 +08:00；旧代码快照：/opt/nikai-ai-backups/releases/previous-20261013-113648-recharge-save-20261013-1。
