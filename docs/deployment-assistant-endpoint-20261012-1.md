# 小助手服务商路径兼容修复

- 发布：assistant-endpoint-20261012-1，成功时间2026-10-12 17:56:13（Asia/Shanghai）。
- 问题：接口路径白名单只接受无前缀的/v1，拒绝StepFun /step_plan/v1/chat/completions，用户配置停留在路径校验阶段。
- 修复：支持带安全路径前缀的/v1或完整/v1/chat/completions；保留前缀，将/v1追加为聊天地址；根地址仍使用/v1/chat/completions。拒绝HTTP、URL凭据、查询参数、片段、错误终点，并继续执行DNS/内网/重绑定保护。
- 范围仅backend/assistant.mjs、public/admin.html、tests/assistant-endpoint.test.mjs；以当前完整生产基底制作680文件完整包。
- 基底SHA256：3c578455ab217a912681f62869994cae36f074732b1e5159831062872d9b55de。
- 发布包SHA256：735376e3324417c58bac205de4323b46722ebfc40c02b09308557525abf6fff2。
- 代码备份：/opt/nikai-ai-backups/releases/previous-20261012-175504-assistant-endpoint-20261012-1。
- 数据库备份：/opt/nikai-ai-backups/mariadb/nikai-ai-20261012-175604-2084663.sql.gz。
- 验证：回归测试先失败再通过；7项助手测试通过。全量本地498项：495通过、3项MariaDB环境测试跳过；服务器498项全部通过。JS语法检查和138项资源检查通过。
- 线上服务active、真实HTTPS健康接口database=true，发布历史success；3个变更文件摘要一致；公网/admin提示已更新；部署代码使用无持久化存储的配置夹具和真实DNS确认用户完整StepFun地址通过校验。
- 没有修改生产助手配置、没有读取输出密钥、没有发起付费模型请求。本次确认路径兼容，模型和密钥的实际可用性仍需用户配置后聊天验证。
