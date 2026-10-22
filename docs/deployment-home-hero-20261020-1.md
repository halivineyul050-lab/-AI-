# 首页首屏发布记录

- 发布 ID：`home-hero-20261020-1`
- 成功时间：2026-10-20 10:42:42（Asia/Shanghai）
- 正式目标：`https://ontimo.cn/`，`admin@47.93.245.219`
- 发布入口：服务器现有 `/opt/nikai-ai/scripts/release-production.sh`
- 基底：当前生产完整应用快照，排除配置、数据库、用户内容和依赖。并行的 `compare-layout-20261020-2` 发布因预检失败未切换，重新取得快照逐文件摘要比对确认应用内容未变后继续本次发布。
- 范围：只替换生产 HTML 中的首屏片段及样式缓存版本，追加首屏 CSS，新增 `public/assets/home/hero-scene-v2.webp`，为新背景加入服务器静态资源白名单。生产原有其他代码保持为发布基底版本。
- 包 SHA-256：`4f8a15de656d1cfb47d5e7abc97246f585dfac87b27176f28d0caf49a2a0f6ee`，上传前后相同。
- 背景文件 SHA-256：`3233475efc27bd9eda2d9e29cb5cb05011e2474f5d17d8c381b89f3519be6b42`。
- 本地使用 Node v22.18.0：依赖安装、服务与前端 JavaScript 语法检查通过；798 项测试中 795 通过、3 跳过、0 失败；138 个图标验证通过。
- 服务器干净目录验证：798 项测试全部通过，无跳过、无失败。
- 数据库备份：`/opt/nikai-ai-backups/mariadb/nikai-ai-20261020-104229-2451895.sql.gz`
- 回滚快照：`/opt/nikai-ai-backups/releases/previous-20261020-103721-home-hero-20261020-1`
- 数据库迁移：无新增。
- 服务：`nikai-ai.service` 为 `active`；本地及公网就绪接口均正常，`database=true`；release history 为本次 `success`。
- 公网首屏和新背景返回 HTTP 200；CSS 版本为 `20261020-hero-reference-2`。
- 浏览器：关闭原有站点公告后验证首屏搜索 `AI 绘画` 提交正常，无页面脚本错误；390px 暗色模式背景透明度为 1、标题为深色、无横向溢出。
- 证据：`docs/home-hero-release-evidence-20261020/` 中的测试、安装、图标校验和服务器发布日志，以及公网桌面、暗色移动端截图。
