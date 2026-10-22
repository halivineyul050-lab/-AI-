# 生图快捷提示词模板发布记录

- 发布 ID：`image-prompt-templates-20260930-1`
- 发布时间：2026-09-30 12:22:36（Asia/Shanghai）
- 变更：生图页保留原有五个灵感按钮，为电影感海报、公众号封面、3D 萌宠、国风插画和电商产品图加入完整中文提示词；新增模板分类、长度和可直接使用性回归测试。
- 发布基底：线上 `image-toolbar-globalfix-20260930-6`；只覆盖 `public/image-generation.html` 的五个 `data-prompt` 属性，并新增 `tests/image-prompt-templates.test.mjs`。
- 发布包 SHA-256：`6677fb55c283bf965037718f2de6186bf73b1aee4dcf5fc115cc4fa15ffefd62`
- 线上 `public/image-generation.html` SHA-256：`739792c0fde86597e235620ec647fc9472748ef21684c6d9c7074f0a8433a2cc`
- 代码回滚快照：`/opt/nikai-ai-backups/releases/previous-20260930-122150-image-prompt-templates-20260930-1`
- MariaDB 备份：`/opt/nikai-ai-backups/mariadb/nikai-ai-20260930-122229-1822023.sql.gz`
- 测试：本机完整套件 332 项，330 通过、2 项平台测试跳过、0 失败；服务器发布脚本 Linux 暂存目录 332/332 通过。`node --check` 覆盖 `server.mjs` 和 92 个前端 JS/MJS 文件；138 个工具 Logo 校验通过。
- 线上验证：`nikai-ai.service` 为 `active`；就绪 API 返回 `status=ok`、`database=true`；公网 `/image-generation` 返回 HTTP 200 并包含 5 条完整模板；页面 CSS、JS 和公网健康 API 均返回 HTTP 200/就绪。
- 浏览器验证限制：本机浏览器自动化连接在读取页面时超时，未能捕获实际点击和控制台状态；公网 HTML 与静态资源已通过线上主机请求核验，模板赋值沿用既有点击处理器。
- 本机临时目录：`C:\Users\zhanglian2\AppData\Local\Temp\codex-nikai-image-prompt-templates-20260930-1` 的递归清理被本机执行策略拒绝；目录仅含本次生产源代码快照、已核验的临时发布包和安装依赖，不含真实配置、数据库或用户数据。服务器端临时文件已清理。
