# Skills页面、导入分享与文本模型执行

- 发布：skills-page-20261010-1，2026-10-10 16:11:42 +08:00，success。
- 地址 /skills，更多→Skills；/skills.html与/skills/永久308至规范路径并保留查询参数。公开搜索、分类、详情、下载SKILL.md、复制指令、安装/接入说明及来源链接。
- 运营中心→Skills管理：新增/编辑/删除/隐藏；上传SKILL.md或导入公开.md/GitHub文件页面；填写ID、名称、分类、简介、安装命令；显式保存发布。初始公开库为空。
- 在线执行支持文本类Skill：管理员开启runnable和配置完整HTTPS Chat Completions兼容接口、模型名、API Key、每日限额；登录用户输入任务调用模型，结果可复制。执行仅发送Skill完整指令和用户任务，不运行服务器命令、附件脚本或代理工具。真实生产模型尚待用户配置，未擅自复用其他服务密钥或模型。
- API Key复用服务器既有AES-GCM加密基础设施保存，读接口只返回hasKey。模型请求与远程导入使用已有safe-upstream，阻止私网/DNS重绑定/跨域凭据重定向；有超时及响应大小上限，失败消息不暴露上游内容。执行限额1–100次/账号/北京时间自然日，单账号一次并发、每分钟最多5次，失败退还次数。目录修订号阻止窗口覆盖。
- SQLite/MariaDB迁移023增加skills_catalog、skills_provider、skills_usage。基于当前生产快照，仅叠加41个审阅文件，647文件完整包SHA-256：e000036d182ea566b4cfc5fe007e03ba5f2b7824ea09eec51c1634da4a217cf7。上传和全部线上审阅文件摘要一致。
- 验证：npm ci、JS语法、414测试（本机411通过/3环境跳过；服务器414全部通过）、138项logo校验。新增7项测试覆盖目录/草稿/冲突、密钥不暴露、调用内容/限额、危险URL、导入私网阻断、身份权限、GitHub导入和失败退款。
- 隔离本机浏览器真实后台发布、文件上传、隐藏、下载、搜索、390px无横向溢出；本机模拟模型通过完整后台配置→前端执行流程。测试账号/Skill/模型/密钥与数据未打包。
- 真实线上Skills页面正常，目录0条、executionReady=false，管理员目录/模型和未登录执行均401，.html308，浏览器无异常；服务active，内外健康200且database=true。
- 代码备份：/opt/nikai-ai-backups/releases/previous-20261010-161044-skills-page-20261010-1。
- 数据库备份：/opt/nikai-ai-backups/mariadb/nikai-ai-20261010-161133-2008311.sql.gz。
- 回滚不撤销新增表或删除Skill数据；恢复代码后保留数据库和加密主密钥。
