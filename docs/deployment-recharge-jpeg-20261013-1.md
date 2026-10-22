# 微信保存JPG的附加数据兼容

- 发布recharge-jpeg-20261013-1，2026-10-13 11:56:10 +08:00，基底recharge-preview-20261013-1。仅backend/manual-recharge.mjs与tests/manual-recharge.test.mjs变化。
- 用户两张实际JPG均为有效JPEG，EOI结束标记后有24字节附加数据，原inspectImage要求最后两个字节为EOI导致拒绝。两图去除后均通过完整JPEG结构验证。
- 人工充值图片输入允许JPEG结束后的最多64KB附加数据，在严格结构验证前剔除，只保存通过校验的JPEG字节；2MB输入限制、格式匹配、结构和尺寸检查保留。仅人工充值收款码/凭证兼容，不改变生图网关通用校验。
- 新增回归：带24字节尾部的二维码/凭证保存为纯图片；缺失EOI和伪造结构仍拒绝且不落库。用户两张原始图片仅在本地内存数据库验证，无真实图片加入发布包或自动配置线上渠道。
- 本地完整540通过3跳过；服务器543/543通过；定向12/12通过；语法及138logo校验通过。
- 包SHA256：4ffde769139ec8c4de2b4a02e13f9e40e7e2f297e48c95c74b55624b34179159，上传后相同，现有release-production.sh发布，无新增迁移。
- 旧代码快照：/opt/nikai-ai-backups/releases/previous-20261013-115456-recharge-jpeg-20261013-1。
- 数据库备份：/opt/nikai-ai-backups/mariadb/nikai-ai-20261013-115600-2120781.sql.gz。
- 线上安装模块在隔离内存数据库实测JPEG尾部兼容通过；服务active，公网ready.database=true，充值配置HTTP200。生产配置与用户内容保持原状。
