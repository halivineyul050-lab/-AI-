# 对比页布局发布 — compare-layout-20261020-4

- 成功时间：2026-10-20 10:50:01 +08:00。
- 目标：admin@47.93.245.219，使用现有授权 SSH 身份、StrictHostKeyChecking=yes 和服务器现有 `/opt/nikai-ai/scripts/release-production.sh`。
- 变更：桌面对比卡正文恢复弹性宽度；手机改为单列、完整宽度正文与结论信息卡；结论标签防挤压；320px 经典滚动条下防横向溢出；添加布局浏览器回归测试；修正视频测试读取旧帧的同步问题，未降低验证标准。
- 正式发布时以已成功上线的 `home-hero-20261020-1` 为基底；其 825 个文件与下载基底逐文件 SHA256 核验一致，仅叠加本次 4 个文件，完整发布包 826 个文件。首页入口、服务器文件、首页 CSS 与新主视觉资源哈希均保留。
- 生产基底快照 SHA256：`06f40fb00fb1ad6557cdc554a75d148b7806efe90aed64451afee5bbc6da7a6f`。
- 发布包 SHA256：`cb81ccc8458cd43bdd02da30c18626d333a27da805b8a64b863278cb430fb156`，本地与上传后相同。保留 `.env.example`，排除真实配置、数据库、用户内容、node_modules 和 Git 数据。
- [文件清单与哈希](compare-layout-20261020/release-manifest.json)。
- 本地 Node 22.18.0：依赖锁定安装、全部 JavaScript 语法检查通过；799 项测试 796 通过、3 环境跳过、0 失败；138 个 Logo 校验通过。
- 服务器干净目录：799 项测试全部通过，0 跳过；数据库备份成功；无待应用 MariaDB 迁移；发布 history 为 success。
- 代码回滚目录：`/opt/nikai-ai-backups/releases/previous-20261020-104455-compare-layout-20261020-4`。
- 数据库备份：`/opt/nikai-ai-backups/mariadb/nikai-ai-20261020-104948-2457138.sql.gz`。
- 服务 active；本机和公网 `/api/v1/health/ready` HTTP 200，database=true。
- 公网 320 / 375 / 390 / 768 / 1440px 浏览器布局通过，结论标签单行、正文占满可用宽度；首页和对比详情 HTTP 200，无页面异常；实际样式字节与发布文件一致。
- 初次 `compare-layout-20261020-2` 因新布局测试的经典滚动条判断未通过，在预检阶段中止，未切换生产。修正后完成全部检查；另一次提交遇到首页发布独占锁，等待首页上线并重新核验、测试新基底后完成本次发布。
- [公网验证日志](compare-layout-20261020/public-verification.log)、[本地完整测试](compare-layout-20261020/local-tests.log)、[服务器发布日志](compare-layout-20261020/server-release.log)、[手机截图](compare-layout-20261020/mobile.png)、[桌面截图](compare-layout-20261020/desktop.png)。

- 收尾：验证截图、完整测试与公网日志已保存；本次本机临时发布目录、Node 运行时和发布包已移入回收站，服务器本次临时包与探测文件已清理。
