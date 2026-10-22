# 超级管理员邮箱验证入口调整

- 发布：admin-email-exempt-20261012-1，2026-10-12 18:06:27 +08:00。
- 基底：线上 assistant-endpoint-20261012-1；完整包只叠加 auth.html、auth.js、auth.css 和账户初始化回归测试。
- 使用服务端 isSuperAdmin 字段隐藏超级管理员邮箱验证区；普通管理员和成员仍显示验证区。未修改邮箱验证记录、登录或找回密码规则。
- 本地 499 项测试：496 通过、3 环境跳过、0 失败；服务器 499 项全部通过。全部公共脚本语法检查和 138 项 logo 校验通过。
- 唯一现行发布脚本完成备份、切换、健康检查；服务 active，真实 HTTPS ready 返回 database=true。线上页面缓存版本和三个公共文件 SHA256 与发布清单一致。
- 代码备份：/opt/nikai-ai-backups/releases/previous-20261012-180522-admin-email-exempt-20261012-1。
- 数据库备份：/opt/nikai-ai-backups/mariadb/nikai-ai-20261012-180618-2087099.sql.gz。
- 未进行用户密码或验证状态变更。本次仅调整账户界面，未使用线上账号凭据进行登录。
