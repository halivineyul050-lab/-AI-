# 首页参考图改版发布记录

- 发布 ID：`homepage-reference-20261009-1`。
- 时间：`2026-10-09T19:16:54+08:00`；用户在当前任务明确授权“更新上线”。
- 目标：`admin@47.93.245.219`，公网 [https://ontimo.cn/](https://ontimo.cn/)。通过已配置 SSH 身份、严格主机指纹校验及服务器现有 `release-production.sh` 发布。
- 基底：当前生产 `image-transfer-20261009-2` 的完整源码快照，SHA-256 `2a31efbfae052fd1429a85bb0bd01655fb9eab366b83d305b8575c0fa42f9468`。发布前再次核对生产版本和首页、app、server 摘要未改变。
- 发布包：616 个文件、26,118,691 字节，SHA-256 `63b35ab249887fc1297d18214dd72418e5e5da754d79aa7864c7db794c395bd6`；本地和上传后的摘要一致。

## 变更范围

仅叠加 11 个审阅文件：`public/index.html`、`public/app.js`、`server.mjs` 的两项静态资源白名单、`scripts/build-site-navigation.mjs`、`scripts/frontend/site-navigation.json`、新增首页 CSS、透明机器人插画、首页四项测试及三份设计/计划/验证文档。

首页采用参考图的紫色首屏、统计面板、机器人、七项快捷入口、四张已发布资讯卡及五列热门工具。生产现有资讯详情、工具数据、生图页与上传修复均保留。打包逐文件对比生产基底，非审阅文件保持完全相同；导航生成器对生图页产生的换行变化已恢复。未包含本地其他未发布改动。包中保留 `.env.example`，排除真实配置、密钥、数据库、用户内容、node_modules 和 Git 数据。

## 验证

- 本地完整候选使用 Node v22.18.0：npm ci 成功；服务与 95 个前端脚本语法检查通过；完整测试 360 通过、3 项平台条件跳过、0 失败；138 个 Logo 校验通过。
- 服务器干净暂存目录再次安装依赖和运行完整测试：363 通过、0 跳过、0 失败；无新增数据库迁移。
- 发布脚本结束成功，release history 为 `success`，服务 `active`；服务器和公网就绪接口均 HTTP 200、`database=true`。
- 公网 CSS、插画、app.js 均 HTTP 200；CSS 缓存版本 `20261009-2`，app 缓存版本 `20261009-home-2`；线上四个关键文件摘要与候选一致。
- Playwright 驱动本机 Edge 访问真实 HTTPS 公网：7 项快捷入口、4 张资讯卡、10 个热门工具；实际工具数量 6330、分类 16；文章打开与关闭、ChatGPT 搜索、AI 绘画分类正常。
- 1672px 桌面和 390px 手机无横向溢出，机器人和四张资讯封面正常加载。页面异常、控制台错误及本站资源请求失败均为 0。
- 首次访问时原有 unpkg 图标脚本耗时约 43 秒，随后加载成功；再次访问和刷新正常。原有站点公告弹窗通过其关闭按钮关闭后完成交互测试。

真实公网截图：`C:/Users/zhanglian2/.codex/visualizations/2026/10/09/01a12039-11ee-77b2-afb8-0710bb68ffd9/homepage-production.png`、`homepage-production-mobile.png`，已打开检查。

## 备份与回滚证据

- 已核验完整旧版本目录：`/opt/nikai-ai-backups/releases/previous-20261009-191603-homepage-reference-20261009-1`。
- 已核验活动数据库备份：`/opt/nikai-ai-backups/mariadb/nikai-ai-20261009-191647-1960051.sql.gz`。
- 后续回滚仍按 `docs/production-release.md` 使用现有 `rollback-production.sh`，保留生产数据库与用户内容。

## 临时文件处理

服务器源码快照已清除；上传发布包由正式脚本成功后清除。自动审批拒绝递归删除已核验的本地临时目录，返回 `blocked by policy`，因此保留 `C:/Users/zhanglian2/AppData/Local/Temp/nikai-home-production-20261009-1`（包含候选源码、包与检查日志），未改走其他删除方式；不影响生产发布。
