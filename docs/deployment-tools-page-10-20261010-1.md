# 全部工具每批 10 条发布记录

- 发布：`tools-page-10-20261010-1`，`2026-10-10T09:49:43+08:00`，目标 `admin@47.93.245.219`、[ontimo.cn](https://ontimo.cn/)。
- 用户需求：截图中“全部工具”的显示数量由 24 条调整为 10 条。默认请求 10 条，既有“加载更多”每次追加 10 条，分类与筛选继续沿用该分页数量。
- 范围：`public/app.js` 的 `toolLimit: 24` 改为 `10`；`public/index.html` 的脚本缓存版本改为 `20261010-tools-10-1`。没有其他应用代码变更。
- 基底：线上 `homepage-reference-20261009-1` 的完整源码，快照 SHA-256 `81d9a9dde1e02d0b7f98a2e574c9c865a7b8e49ecf476d808a90dbdd66872b27`。工作区已有其他未发布改动，候选只对生产基底精确替换上述两行，逐文件核验其余源码相同。
- 完整包：616 文件、26,118,535 字节，SHA-256 `487a7b7a2aa17390e2933b634e0c4d846ed4fe422c5a444d2ff543d51b647d06`，上传后摘要相同。保留 `.env.example`，排除真实配置、密钥、数据库、用户内容、node_modules 与 .git。
- 通道：严格验证已知主机身份，复用既有 SSH 身份，通过服务器现有 `/opt/nikai-ai/scripts/release-production.sh` 发布。

## 验证

- 本地与线上 Node 均 v22.18.0；候选 npm ci 成功；server 与 95 个前端脚本语法检查通过；完整测试 360 通过、3 项平台条件跳过、0 失败；138 个 Logo 校验通过。
- 本地浏览器：默认 10 条，加载更多后 20 条；只有 4 条的分类显示全部 4 条且隐藏分页；列表/卡片模式均正常。
- 服务器干净暂存目录完整测试 363 通过、0 跳过、0 失败；无新增数据库迁移；发布记录为 success。
- 服务 active，服务器与真实公网 ready 接口均 HTTP 200、database=true；新版 app.js HTTP 200；首页与 app.js 线上摘要和候选一致。
- 真实公网 Edge 浏览器：首次与刷新均“已显示 10 / 6330”，默认请求 limit=10、offset=0；点击加载更多请求 limit=10、offset=10，显示 20 条且 20 个 ID 唯一；列表和卡片模式正常。
- 公网页面异常、控制台错误均 0；390px 手机无横向溢出，仍显示 10 条。
- 截图已检查：`C:/Users/zhanglian2/.codex/visualizations/2026/10/09/01a12039-11ee-77b2-afb8-0710bb68ffd9/tools-page-10-production-20261010.png`。

## 备份和临时文件

- 已核验回滚快照：`/opt/nikai-ai-backups/releases/previous-20261010-094852-tools-page-10-20261010-1`。
- 已核验数据库备份：`/opt/nikai-ai-backups/mariadb/nikai-ai-20261010-094935-1969153.sql.gz`。
- 回滚按 `docs/production-release.md` 使用现有 rollback-production.sh。
- 候选预览服务及验证浏览器已关闭；上传包由正式发布脚本成功后删除，服务器基底快照已清理。
- 自动审批以 `blocked by policy` 拒绝递归清理已核验的本地临时目录，保留 `C:/Users/zhanglian2/AppData/Local/Temp/nikai-tools-10-production-20261010-1`，未改走其他删除方式。
