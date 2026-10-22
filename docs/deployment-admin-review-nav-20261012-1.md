# 投稿审核导航修复 — 2026-10-12

- 发布 ID：`admin-review-nav-20261012-1`，11:58:03 +08:00 成功。
- 原因：最后的审核队列较短，页面滚动到底仍无法进入原 IntersectionObserver 的狭窄激活区域，菜单保留其他栏目的选中状态。
- 修复：点击导航立即同步高亮与 aria-current；根据全体栏目位置更新滚动选中状态，到底时识别最后栏目。更新 admin.js 缓存版本。
- 以线上当前 660 文件快照为基底，只叠加 admin.js、admin.html、导航回归测试与缓存版本断言（共 4 文件），发布包 661 文件。
- 发布包 SHA256：`7f8e97a5167e3a5304df9016605760cd5a2ab70f7aa6ff72136a14b27fec2ff0`，上传后比对一致。
- 本地 463 项测试：460 通过，3 项环境测试跳过，0 失败；服务器 463 项全通过；138 个 Logo 通过。
- 浏览器复现旧版点击后停在错误菜单；修复版点击投稿审核后 #reviews、高亮和审核队列显示一致；滚动返回其他栏目回归通过。
- 服务 active，就绪接口 database=true，发布历史 success；生产四个改动文件哈希与测试包一致。
- 代码备份：`/opt/nikai-ai-backups/releases/previous-20261012-115703-admin-review-nav-20261012-1`
- 数据库备份：`/opt/nikai-ai-backups/mariadb/nikai-ai-20261012-115755-2058801.sql.gz`
- 公网 admin.js HTTP 200，内容逐字匹配已测试版本；公网就绪接口 database=true。
