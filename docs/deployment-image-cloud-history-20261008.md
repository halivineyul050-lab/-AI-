# 账号云生图历史发布记录

- 发布时间：2026-10-08 10:08:39（Asia/Shanghai）
- 发布 ID：`image-cloud-history-20261008-1`
- 发布包 SHA-256：`459ac49bf93c81fd3b71cbb0b7f849b285409b868f657fe5284769492fc42cf7`
- 范围：登录后生成图片自动保存到账号云历史；跨设备列表、预览、下载、分页、逐张删除与清空；原浏览器旧历史保留且不再新增本地图片；图片分块入库与备份调整。迁移 20。线上基底为 `image-no-local-save-20260930-1`，未包含工作区其他未上线改动（包括迁移 19）。
- 回滚目录：`/opt/nikai-ai-backups/releases/previous-20261008-100750-image-cloud-history-20261008-1`
- 发布前数据库备份：`/opt/nikai-ai-backups/mariadb/nikai-ai-20261008-100832-1921025.sql.gz`，校验文件存在。
- 验证：隔离发布目录 `npm test` 333/333，通过 `npm run logos:verify`（138 项）和全部公开 JS/MJS 及服务入口语法检查；服务器干净目录复测 335/335；服务为 `active`，本机与公网域名（从服务器出口）就绪接口返回 `database=true`；公网 `/image-generation` 与 JS/CSS 返回 200，页面含缓存版本 `20261008-cloud-history-1` 和“账号云历史”；匿名云历史、媒体、生成接口返回 401；数据库迁移 20 及主表、分块表存在，发布记录为 `success`。
- 验证限制：当前 Windows 机器直连该域名的 TLS 握手被重置，故公网页面与接口通过服务器出口核实；未使用真实用户账号进行付费生图验证。云历史新表在发布时为 0 条。

## 当日补充发布（当前线上版本）

- 发布时间：2026-10-08 10:17:27（Asia/Shanghai）
- 发布 ID：`image-cloud-history-20261008-2`
- 发布包 SHA-256：`02dd97475f0dee8d4725e99d00ae2398a0da6ce487097913747a26b0668d0d40`
- 补充范围：云保存失败时只记录错误码；增加超过 50 张持续保留、分页无重复和整批回滚测试。其余功能与初次发布一致，迁移无新增执行。
- 回滚目录：`/opt/nikai-ai-backups/releases/previous-20261008-101636-image-cloud-history-20261008-2`
- 发布前数据库备份：`/opt/nikai-ai-backups/mariadb/nikai-ai-20261008-101720-1923518.sql.gz`，校验文件存在。
- 验证：隔离目录 `npm test` 334/334、`logos:verify` 138 项通过；服务器干净目录复测 336/336；发布记录为 `success`，服务 `active`、就绪接口 `database=true`，公网域名页面 200 且包含 `20261008-cloud-history-1`、账号云历史及本机旧历史；匿名云历史和生图接口均返回 401；迁移 20 已存在。
