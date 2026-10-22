# 周报订阅管理样式修订发布

- 版本：newsletter-style-20261019-1。
- 时间：2026-10-19 11:07:11 +08:00；发布历史 success。
- 基底：当前线上 subscribers-image-20261019-1 完整快照，基底 SHA-256 403ead6b228a481d3010f3d57021694b15d63c9f06bbf685d7b49e07775eb029。
- 发布包 SHA-256：c30c32e287340a719cf46f56d97f499b4e0150e9ee9210c176ea36a83c1a9f4f；上传前后相同。
- 发布入口：服务器现有 /opt/nikai-ai/scripts/release-production.sh。
- 代码回滚：/opt/nikai-ai-backups/releases/previous-20261019-110314-newsletter-style-20261019-1。
- 数据库备份：/opt/nikai-ai-backups/mariadb/nikai-ai-20261019-110659-2378921.sql.gz。
- 无数据库迁移。

## 修改范围

仅 public/admin.html、public/admin.css、public/admin.js、tests/admin-layout-order.test.mjs、tests/admin-session-bootstrap.test.mjs、tests/nestdutio-history-browser.test.mjs 六个文件。生产快照比对确认没有其他文件变化；未发布工作区其他改动或用户数据。

统计改为四项概况，筛选栏统一对齐，表格加状态标签，来源中文化，时间分行，分页与邮件接收说明置于底部。手机端改为逐条卡片。样式全部限定在 newsletter-admin 节点。更新 CSS、JS 缓存版本。历史项目测试改为等待目标项目消息，避免旧消息存在即通过等待的竞态，原断言保留。

## 验证

- 本地 Node 22.18.0：完整 751 项，748 通过、3 平台跳过、0 失败。JavaScript 语法与 138 个 Logo 验证通过。
- 服务器干净目录：751 项全部通过，0 跳过、0 失败。
- 浏览器真实登录 fixture：搜索、状态筛选、20+3 分页、空结果、全局统计、390px 手机宽度及无页面脚本错误检查通过。
- 视觉检查：桌面表格与手机卡片截图均检查；证据见 newsletter-style-evidence-20261019。截图使用合成邮箱；手机面板截图仅隐藏旁侧导航以隔离展示模块。
- 公网：就绪 200、database=true，服务 active，匿名名单 401；CSS/JS 均 200，最新缓存版本、统计结构、响应式规则、状态标签和中文来源均确认。
- 服务器文件 SHA-256：
  - admin.css：55ab0032277a7e394c56594a52016fb12532b4a220a2219c90a0e85057c97300
  - admin.js：b35eb6e1ad92bb1872dca4b5ac0f1338a756cb9d3ae9e994e23ff84765a6dabe
  - admin.html：3993e7d2e1b55532b350bcde75365261871bb079eca0205e972b71cb9120f44b

临时目录清理被自动审批策略拒绝，未绕过；暂存目录与发布包保留，不影响线上服务。
