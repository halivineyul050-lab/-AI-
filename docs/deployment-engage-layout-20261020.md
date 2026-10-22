# 参与区域布局发布记录

- 发布ID：engage-layout-20261020-1；目标 admin@47.93.245.219，主机指纹通过既有 StrictHostKeyChecking SSH 验证。
- 用户要求：截图“参与进来”整个区域整理。
- 仅改 site-catalog.css 中 engage 区块，以及 styles.css/index.html 样式缓存版本。
- 以线上完整代码快照为基底，排除 .env、.mariadb.cnf、data、imports、node_modules、.git；保留 .env.example。逐文件审计与独立审查确认仅3文件变化，无其他增删。发布前 tar --compare 确认线上基底未变。
- Chrome预览：1440、1024、768、720、390、320宽度，无横向溢出；桌面按钮位置差小于1像素。桌面/手机截图人工检查通过。
- 完整目录 npm ci、服务端/公共JS语法检查、npm test成功：808测试，805通过、3跳过、0失败；138图标校验通过。
- 发布包SHA-256：61e5394df51e2271ccb84d344dd63cf7a7de143dcfd746f8c7bfc4d569dd11c2，本机与上传后相同。
- 唯一发布入口 /opt/nikai-ai/scripts/release-production.sh 已调用，服务器808测试全部通过（0跳过、0失败），已成功切换。

- 最终状态：2026-10-20 14:14:44 +08:00 success，nikai-ai.service active；回环及服务器通过真实域名 HTTPS /api/v1/health/ready 均返回 database true。
- 原代码回滚快照：/opt/nikai-ai-backups/releases/previous-20261020-140851-engage-layout-20261020-1。
- MariaDB备份：/opt/nikai-ai-backups/mariadb/nikai-ai-20261020-141431-2478305.sql.gz；无迁移待执行。
- 首页样式缓存版本20261020-engage-layout-1；CSS网络响应、服务器文件与本机验证文件SHA-256均为 1e5205872ab14097e7769597e7e57c6b3ec72402f5e2e23b948adab1c8a11d49。
- 本机外网HTTPS仍连接被重置，外部抓取也未成功。可以确认服务器版本已更新，但未确认公网访问通过；该现象切换前已存在。
- 预览截图：screenshots/engage-layout-20261020-desktop.png、screenshots/engage-layout-20261020-mobile.png。
- 临时文件清理被自动审批以 blocked by policy 拒绝，未提供具体原因，未绕过审批。保留本机 TEMP 下 nikai-engage-release-20261020 目录、nikai-engage-base-20261020.tgz、nikai-engage-layout-20261020.tgz、测试日志及预览截图/脚本。服务器 /tmp 两份同名归档亦保留；正式回滚快照不受影响。
