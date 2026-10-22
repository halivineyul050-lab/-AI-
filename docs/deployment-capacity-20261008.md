# 限流与生图历史容量修复（2026-10-08）

- 发布 ID：`capacity-20261008-1`；服务器发布历史 `2026-10-08T11:09:00+08:00 success`。
- 以 `ops-hardening-20261008-1` 完成后的线上完整版本为基底，仅叠加 `server.mjs` 中的限流器接线、`backend/rate-limiter.mjs`、`backend/image-cloud-history.mjs`、对应测试和 CI 工作流。完整发布包 SHA-256：`5aa83d11bd019fdd463fbac675174427cf190b4e89a235fd0970757cb6f37fc3`。
- 本机隔离目录 343 项测试中 340 通过、3 跳过；服务器发布预检 343 项全部通过。代码回滚快照：`/opt/nikai-ai-backups/releases/previous-20261008-110810-capacity-20261008-1`；发布前数据库备份：`/opt/nikai-ai-backups/mariadb/nikai-ai-20261008-110853-1931171.sql.gz`。
- 限流器最多保存 5000 个活跃键；容量满时清理过期键，如仍满则对新键返回 429，已有键继续按原限流规则处理。
- 生图云历史新增每账号 1 GiB、全站 8 GiB 写入上限。达到上限时不删除旧图；本次图片仍以临时下载结果返回，并提示保存失败。发布时云历史表为 0 行。
- 发布后 `nikai-ai.service` 为 `active`；本机和公网就绪 API 返回 `status=ok`、`database=true`；公网首页、模型 API 和搜索返回 200。每日备份 service 保持 `Result=success`、退出码 0；代码 world-writable 文件数保持 0。
- CI 工作流文件已进入发布包，但 GitHub Actions 只读取 Git 远端仓库。工作区与远端分支尚未对齐，本次未推送，故不可声称 GitHub 的 main 推送检查已生效。
