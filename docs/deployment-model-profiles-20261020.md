# 命名模型配置库发布记录

发布ID model-profiles-20261020-1；目标已验证主机 admin@47.93.245.219。使用既有SSH身份和StrictHostKeyChecking，无凭据写入代码、日志或归档。

用户明确要求多套命名配置、后续切换和跨模块复用。范围为新加密store、SQLite/MariaDB042、超管私有API、共享前端配置库及四处接入，旧测试缓存和迁移断言随版本更新。17修改+7新增经独立审查，与最新线上快照比对无发布污染；未带入本地未发布news改动。

新API和真实临时账号浏览器验证：加密落盘/重开持久化、无明文响应、超级管理员与CSRF、同地址复用与跨地址/类型拒绝、3聊天模块与图片平台应用、发现模型、删除与活动配置解耦、1440/390无溢出。截图见 screenshots/model-profiles-1440-20261020.png 和 model-profiles-390-20261020.png。真实KEY未被读取或测试修改。

首次完整回归暴露旧缓存/版本断言；更新后66相关测试通过；重新完整运行815测试：812通过、3跳过、0失败。138图标校验通过。

完整发布包SHA-256 0d7dc8fce9768906447bf47979a280636b5e76ee03532d68436b34a6361c845d，本机与上传摘要一致。包含.env.example，排除真实env、.mariadb.cnf、data、imports、node_modules、.git。发布前tar --compare确认基底未变。使用 /opt/nikai-ai/scripts/release-production.sh，服务器815测试全部通过（0跳过、0失败），迁移042已执行，版本成功切换。


最终确认：2026-10-20 14:42:58 +08:00 发布success；nikai-ai.service active，回环健康database true。服务器通过真实域名获取新admin页面含admin-model-profiles.js?v=20261020-profiles-1；JS网络响应与本机验证文件SHA-256均为 d6aee37743c4515fccdfe727026551758a9331b3bc0b2c060a336a40dd45db56。匿名配置库API401。schema_migrations中042与information_schema新表均存在。

MariaDB10.5.29上只读EXPLAIN验证了实际限额INSERT...SELECT结构可执行，无测试记录插入真实表；未读取或更改现有活动KEY。

原代码快照：/opt/nikai-ai-backups/releases/previous-20261020-143732-model-profiles-20261020-1。数据库备份：/opt/nikai-ai-backups/mariadb/nikai-ai-20261020-144245-2484249.sql.gz。回滚使用既有rollback-production.sh，新增表保持向后兼容，不删除用户方案；数据库恢复属于独立灾难恢复操作。

本机外网HTTPS健康请求仍出现切换前已存在的连接重置，不能声称公网访问通过；确认的是服务器版本、迁移和源站域名响应更新。无需用户重新填写已有KEY；使用方式见 model-profile-library.md。

临时清理：本机TEMP/nikai-profiles-release-20261020经绝对路径核验后删除仍被自动审批以blocked by policy拒绝，无更具体原因，未绕过。隔离stage、原工作区基线、验证日志/脚本、本地与服务器/tmp发布归档保留，不影响已发布代码和备份。
