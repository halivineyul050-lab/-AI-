# 生图模板使用说明发布记录

- 发布 ID：`image-prompt-usage-hint-20260930-1`
- 发布时间：2026-09-30 12:51:18（Asia/Shanghai）
- 发布基底：线上 `image-prompt-templates-20260930-1`
- 变更：在五个快捷提示词按钮上方增加“一键套用完整提示词”说明；点击按钮会把对应完整提示词填入上方描述框。更新生图页 CSS 缓存版本，并同步更新现有页面测试断言。
- 发布包 SHA-256：`8022e55cced38cb6a15f987ffbee2eeef850854d80f52516970f373d213c869f`
- 线上 HTML SHA-256：`21dcbe7c219c49ef0216f9401fe67a1c5bd5c9c792615d18dc6bdb7a1d6c5400`
- 线上 CSS SHA-256：`056144b81b415b60cbbbb8954f485aa52623582389820a130ad1cedb09d83780`
- 代码回滚快照：`/opt/nikai-ai-backups/releases/previous-20260930-125032-image-prompt-usage-hint-20260930-1`
- MariaDB 备份：`/opt/nikai-ai-backups/mariadb/nikai-ai-20260930-125111-1824610.sql.gz`
- 测试：Windows Node.js 22.18.0 本地完整套件 332 项，330 通过、2 项平台条件跳过、0 失败；92 个前端 JS/MJS 语法检查通过；138 个 Logo 校验通过。服务器干净暂存环境完整测试 332/332 通过。
- 线上验证：发布历史记录为 `success`；`nikai-ai.service` 为 `active`；本机就绪 API 和公网域名 API 返回 `status=ok`、`database=true`；公网 `/image-generation` 和版本化 CSS 均 HTTP 200，HTML 含可见提示文案、CSS 含对应样式。
- 浏览器交互验证：桌面浏览器自动化连接报 `nodeRepl.fetch request failed`，绑定和打开生图页均超时；未能捕获用户浏览器中的实际点击画面。线上 HTML/CSS 与发布哈希已核对。
- 本机 `curl.exe` 请求公网健康 API 时连接被重置；生产主机经公网域名请求该 API 返回健康，页面与版本化 CSS 均返回 HTTP 200。
- 发布脚本已清理服务器上传包。本机临时准备目录（不含真实配置、数据库或用户数据）因本机执行策略拒绝递归删除而保留。
