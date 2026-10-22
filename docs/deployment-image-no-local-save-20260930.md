# 生图结果停止自动保存在本地：发布记录

- 发布 ID：`image-no-local-save-20260930-1`
- 发布时间：2026-09-30 13:26:16（Asia/Shanghai）
- 发布基底：线上 `image-prompt-usage-hint-20260930-1`
- 发布包 SHA-256：`42ab8c43eebaa394f53ccb99714604f3fc02303aedd0c1de0eddfb7f50c0fb1a`（25,247,137 字节）
- 发布范围：从已核验的线上完整版本制作发布包，只叠加生图页 HTML、脚本及两份相关测试；未带入其他工作区改动、配置、数据库、用户内容或 `node_modules`。

## 行为变化

- 新生成图片只显示在当前结果页，不再额外下载图片 Blob 并写入浏览器 IndexedDB。
- 已有本地历史保留，可继续查看、下载和删除；清空历史操作仍由用户主动触发。
- 页面说明新图不会自动加入历史，需要留存时点击“下载”。更新脚本查询版本，避免浏览器沿用旧代码。
- 生图 API 的结果仍由服务端临时提供；本次未更改其既有临时保留策略。

## 测试与线上验证

- Node.js 22.18.0：干净线上副本执行 `npm ci`、全部 332 项测试（332 通过，0 失败，0 跳过）、92 个前端 JS/MJS 语法检查，以及 138 个 Logo 资源校验。
- 服务器发布脚本再次在干净暂存目录执行全量测试：332 通过，0 失败，0 跳过。
- `nikai-ai.service` 为 `active`；本机就绪 API 和公网 live、ready API 均返回 HTTP 200，ready 返回 `database=true`。
- 公网 `/image-generation` 返回更新后的文案和 `image-generation.js?v=20260930-no-local-save-1`；该脚本可访问且不含自动历史写入逻辑。
- 线上 HTML SHA-256：`c20091d711dded638b82c1f7b3003b129dfcbc2186901114ec1d64bdfd131d17`。
- 线上脚本 SHA-256：`7074b99e8d465a26c35102cb90478cd1f0a72d709f2be0324869a0261c063a4e`。

## 备份与回滚

- 发布历史记录：`success`，编号 `image-no-local-save-20260930-1`。
- 发布前代码目录：`/opt/nikai-ai-backups/releases/previous-20260930-132530-image-no-local-save-20260930-1`。
- 发布代码快照：`/opt/nikai-ai-backups/releases/release-20260930-132530-image-no-loc.tgz`。
- MariaDB 备份：`/opt/nikai-ai-backups/mariadb/nikai-ai-20260930-132609-1827282.sql.gz`（SHA-256：`ba2cdb7feb0ce923fe97c0b2793d5ef94fed31d4f64871a5bcf589f74c6691d7`）。
