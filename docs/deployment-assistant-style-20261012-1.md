# 小助手配置后台样式发布

- 发布ID：`assistant-style-20261012-1`；时间2026-10-12 16:35:10 +08:00。
- 基底：线上mobile-nav-20261012-1完整673文件快照，只叠加public/admin.html与public/admin-creator.css。其他工作区改动未发布。
- 归档SHA-256：`42870f2de46b3be0c90391fa93014279cae78bddda778c4216042d206f359e5e`；上传一致，部署后2文件摘要一致。
- 代码快照：`/opt/nikai-ai-backups/releases/previous-20261012-163407-assistant-style-20261012-1`
- 数据库备份：`/opt/nikai-ai-backups/mariadb/nikai-ai-20261012-163501-2076728.sql.gz`；无迁移。

改为带内边距的基础设置/模型接入双卡片，状态条、紧凑开关、短次数框、说明文字和自然宽度保存按钮；小屏幕单列。字段和业务行为保留，样式限定小助手区域。

本机完整484通过、3项环境跳过；最终小调整后20项相关测试通过；服务器487全部通过。语法与138个logo核验通过。浏览器验证保存/重新加载和缺模型校验、320/390/768/1440px无溢出，开关40×24。公网/admin包含分组与新版样式版本，CSS HTTP200；服务active、ready数据库true、release-history success。公网资源验证经已授权SSH执行，交互/视觉验证在候选服务完成。

设计、截图与清单见docs/assistant-admin-style-20261012。
