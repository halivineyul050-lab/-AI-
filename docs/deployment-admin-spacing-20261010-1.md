# 运营中心卡片边距修正

- 发布：admin-spacing-20261010-1，2026-10-10T16:43:04+08:00，success。
- Skills管理和个人主页卡片增加20–36px内边距；模型配置桌面两列、手机单列；标题及表单间距、分隔线、小尺寸保存按钮；CSS缓存版本20261010-spacing-1。
- 仅更新public/admin-creator.css和public/admin.html，使用线上当前完整647文件版本为基底，归档SHA256：24e9c361355a15799008203b379ffe22c274c3caeb3e594516bdbb517355a35c，上传前后一致。
- 本地全套测试复跑411通过、3环境跳过、0失败；第一次计时敏感的网关过期清理测试失败，未修改测试，复跑通过。服务器414全部通过；JS检查和138项Logo检查通过。
- 本地隔离表单视觉检查：桌面padding36px、模型表单两列、保存按钮121px；390px手机padding20px 16px，单列、无横向溢出。
- 代码备份：/opt/nikai-ai-backups/releases/previous-20261010-164207-admin-spacing-20261010-1
- 数据库备份：/opt/nikai-ai-backups/mariadb/nikai-ai-20261010-164255-2012966.sql.gz
- 服务active、内外就绪database=true；线上两个文件摘要均与发布清单一致；公网新CSS返回200且包含新增边距规则。
