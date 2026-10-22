# 个人主页后台布局 — 发布记录

- 发布ID：creator-layout-20261013-1；成功时间：2026-10-13T18:19:12+08:00。
- 基底：线上 image-job-reliability-20261013-1。完整634文件，仅叠加public/admin.html、admin-creator.css和admin-creator.js。
- 基本资料、平台账号、文章视频作品三张卡片；基础字段双列/手机单列；条目摘要显示名称、类型/昵称、公开状态；实时计数与标题更新，新条目展开、同组其他条目收起。固定底部保存栏同步显示操作提示。
- 所有样式限定#creator-admin，保留其他共用表单样式。无数据库迁移，不修改正式个人主页内容。
- 本地568通过/3环境跳过；服务器571全部通过。全量语法、138个Logo验证通过。
- 浏览器真实测试账号：三卡片、已有内容折叠、新增展开和实时标题、删除及保存发布成功，控制台无异常；保存栏在1440x1000下位于y903至988；手机390px下容器360px无横向溢出。
- 公网：admin HTML三卡片、基础网格、保存栏及新缓存引用已核验；CSS/JS哈希与测试候选相同。service active，ready status=ok/database=true。
- 代码备份：/opt/nikai-ai-backups/releases/previous-20261013-181755-creator-layout-20261013-1。
- 数据库备份：/opt/nikai-ai-backups/mariadb/nikai-ai-20261013-181903-2149077.sql.gz。
- SHA256：5b99106e041f1fa9ffea3d11b08604024dd258f44dffcee27a10eb7fce00479c。
