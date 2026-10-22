# 生图工具栏标签全宽度修复发布记录

- 发布 ID：`image-toolbar-globalfix-20260930-6`
- 发布时间：2026-09-30 11:37:20（Asia/Shanghai）
- 变更：让工具栏按需换行、选择项不收缩、比例/风格/数量标签禁止折行；页面样式版本更新为 `image-generation.css?v=20260930-image-toolbar-wrap-6`。
- 发布基底：线上 `image-toolbar-wrap-fix-20260930-5`，仅叠加审阅过的页面 CSS、页面样式版本号和对应回归测试。
- 发布包 SHA-256：`191F2B298CC251D45F0BFC7764966381CD69D599AB2E6D6535232F4D9FEDD97A`
- 代码回滚快照：`/opt/nikai-ai-backups/releases/previous-20260930-113634-image-toolbar-globalfix-20260930-6`
- MariaDB 备份：`/opt/nikai-ai-backups/mariadb/nikai-ai-20260930-113713-1819060.sql.gz`
- 测试：Windows 完整套件 328 通过、0 失败，2 项依赖 Linux/systemd 的发布集成用例按配置跳过；服务器 Linux 暂存目录 330/330 通过。`node --check` 覆盖 `server.mjs` 和 92 个前端 JS/MJS 文件；138 个工具图标校验通过；`npm audit --omit=dev` 发现 0 个漏洞。
- 线上验证：`nikai-ai.service` 为 `active`；就绪 API 返回 `status=ok`、`database=true`。公网页面、健康 API 和新版本 CSS 均返回 HTTP 200；页面引用样式版本 `wrap-6`。
- 布局验证：线上浏览器在 2537、1640、883、390px 宽度下，比例/风格/数量标签均为 `white-space: nowrap` 且各一行，页面无横向溢出；控制台错误数为 0。
- 验证截图：`C:/Users/zhanglian2/AppData/Local/Temp/ontimo-image-toolbar-live-20260930.png`
