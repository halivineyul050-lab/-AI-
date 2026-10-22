# 紫色机器人聊天助手发布记录

- 发布 ID：`assistant-20261012-2`
- 时间：2026-10-12 16:00:24 +08:00
- 方式：核验当前生产完整快照，仅叠加19个本次文件，授权SSH上传并调用现有release-production.sh。保留用户数据和原配置。
- 归档SHA-256：`442a6d4fc84e036e1a1d1e9ef3b3a93f90c0b39d982817ea8caab76589542070`；上传摘要一致，部署后的19个变更文件摘要一致。
- 代码回滚快照：`/opt/nikai-ai-backups/releases/previous-20261012-155920-assistant-20261012-2`
- 数据库备份：`/opt/nikai-ai-backups/mariadb/nikai-ai-20261012-160015-2071869.sql.gz`

新增紫色机器人悬浮入口、聊天面板、快捷问题、停止与重置、登录提示和站内工具推荐。首页、资讯、Skills、个人主页、生图及工具目录等页面可用；后台、登录和独立游戏不注入聊天面板。聊天采用独立的OpenAI兼容模型接口，密钥加密保存且不返回浏览器。运营中心新增“小助手配置”，每日每账号1至10次可配置。新增SQLite/MariaDB 025迁移；失败请求退回次数，并限制并发、请求长度、上游响应和时间。

验证：本机完整套件481通过、3项环境跳过；服务器484全部通过。JavaScript语法检查和138个logo验证通过；浏览器检查1440px桌面/390px手机布局、Escape收起、管理员保存、登录后POST和受控模型响应。API测试覆盖未登录、普通用户管理拒绝、配置脱敏、模型回复、每日限额和页面资源注入。服务器服务active，ready数据库true，release-history success；公网首页引用assistant.js新版本，assistant.css 200，未认证管理接口401，公开配置不含密钥。

上线默认enabled=false、ready=false，正式模型尚未配置；没有复用其他功能密钥，没有宣称正式模型已聊天成功。管理员到 `/admin#assistant-admin` 填写接口地址、模型名称和API Key并启用，前台登录账号后可使用。配置地址允许HTTPS根地址、/v1或/v1/chat/completions。

工作区仅同步本次新增文件和基底差异，保留其额外019迁移等未发布改动；工作区迁移断言按本地版本单独更新，不把这些无关改动带入生产包。截图位于docs/assistant-design/implemented-desktop.png、implemented-mobile.png、chat-verified.png。
