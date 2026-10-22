# 交互讲解导航统一发布

版本 `explain-nav-20261015-1`，2026-10-15 11:35:20 +08:00，release history success。

根因：/explain仍使用原型的独立页头，没有登记全站导航配置。改为utility共享导航，复用搜索、账号、主题和手机菜单；在“创作与效率”加入交互讲解并高亮当前页。通过原有生成器更新23个页面，保证入口一致且可重复生成。交互内容CSS限定在.explainer-content，去除原型header样式影响，并修正深色主题卡片颜色。

## 发布范围与验证

基底为发布前线上explainer-ai-20261015-1完整应用，完整文件SHA清单核对无漂移。共26个变更文件：23个HTML、explain.css、导航JSON和新增回归测试；后端与AI模型配置未变。没有携带本地其他未集成改动、配置、用户内容或数据库。

完整包SHA256：`17268211caa33465754f058c2f9cef375605312fdecd2e67428985ef70387ea2`，上传前后匹配。沿用授权SSH和服务器现有release-production.sh，无迁移、无新增依赖。

- 代码回滚快照：`/opt/nikai-ai-backups/releases/previous-20261015-113348-explain-nav-20261015-1`。
- 数据库备份：`/opt/nikai-ai-backups/mariadb/nikai-ai-20261015-113510-2220510.sql.gz`。
- 本地625项：622通过、3项平台跳过、0失败；服务器625项全部通过；Logo138项、前端语法检查通过。
- 导航专项：公共页头一致性、手机菜单开关/Escape/账号互斥、当前分组高亮、生成器修复漂移和幂等检查通过。

真实Chrome公网/explain返回200；桌面共享页头和“交互讲解”当前链接正确。手机390px菜单展开、分组展开后当前链接可见，Escape关闭，页面无横向溢出。匿名登录/账号中心入口存在；主题切换后卡片背景rgb(27,25,39)、文字rgb(243,240,250)，对比正常。月相180度显示新月0%，AI配置ready=true，健康200、database=true，服务active，无脚本异常。

截图：output/interactive-explainer/nav-production-desktop.png、nav-production-mobile.png。完整包、上线前基底和测试日志保留在output/workspace-backups。服务器本次/tmp产物核验后清除；Windows隔离目录nikai-explain-nav-20261015暂留（既有策略阻止递归删除，不绕过）。
