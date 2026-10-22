# 后台配置面板样式回归修复

版本admin-provider-style-20261015-1，2026-10-15 14:56:44 +08:00，发布记录success。

用户截图中的讲解配置没有匹配小助手配置的卡片、开关、状态与保存区样式。根因是旧样式按#assistant-admin等专属ID组织，新模块只复用了类名；此前验收验证了保存行为，没有对实际样式和尺寸设置断言。

将已有配置样式从admin-creator.css提取到admin-provider.css，按共用provider-settings-panel与表单类组织。小助手与交互讲解面板共同使用；讲解设置改为接入方式/资源卡片、独立接入卡片及紧凑保存区。明确处理隐藏fieldset，开关保持40×24，清除密钥为16px复选框。新增样式静态白名单与独立缓存版本，同时更新旧样式及讲解脚本缓存引用。

新增admin-provider-layout.test.mjs，使用真实Chrome/Chromium加载后台完整DOM与全部样式，并挂载实际讲解配置脚本（配置响应受控，不读取真实密钥）。自动核验继承/独立模式、1440/390px、开关尺寸、保存按钮宽度、卡片圆角、面板留白、隐藏状态，以及旧小助手同一开关样式。所有assistant-provider-form必须位于共用面板类内。修复前该检查因面板留白缺失失败，修复后通过；不把文本匹配当成视觉验证。

## 发布与验证

- 基底为线上anatomy-20261015-1，基底SHA256：31a3f571626afb64311f30db1c903b83656da4c28fd7ce735a50eeca1a0a6e3d。
- 仅叠加server.mjs、admin.html、admin-creator.css、admin-explainer.js、admin-provider.css及新浏览器布局测试，共6文件；没有配置值、依赖或数据库迁移变化。
- 完整发布包SHA256：e294f65c25226018fe34f02610e0889f5bfb3872599e6732621942d21537a58e，上传前后一致；调用现有release-production.sh发布。
- 代码快照：/opt/nikai-ai-backups/releases/previous-20261015-145506-admin-provider-style-20261015-1。
- 数据库备份：/opt/nikai-ai-backups/mariadb/nikai-ai-20261015-145634-2233705.sql.gz。
- 本机655项：652通过、3项平台跳过、0失败；服务器655项全部通过，包括Linux Chromium真实布局检查。语法检查与138项Logo验证通过。
- 浏览器实测：桌面面板padding36px，开关40×24，保存按钮宽156px；390px独立模式无横向溢出。截图保存在output/interactive-explainer/admin-provider-*-fixed.png，截图使用实际后台DOM/完整CSS与受控配置数据，不是实际管理员账号截图。
- 公网三项新缓存CSS/JS均HTTP200且MIME正确；远端admin.html、共用CSS和讲解JS的SHA256与本机测试文件一致。服务active，健康HTTP200/database=true。

根工作区保持既有未发布改动，仅回写本次文件；server只叠加静态白名单一项。服务器本次/tmp基底和上传归档在验收后清除，正式版本与回滚备份保留。Windows隔离目录遵守既有清理限制暂留，不绕过被拒绝的递归清理。
