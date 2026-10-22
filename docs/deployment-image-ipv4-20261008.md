# 生图网关 IPv4 连接修复记录（2026-10-08）

- 发布 ID：`image-ipv4-20261008-2`；服务器发布历史记录为 `success`，时间 `2026-10-08T10:20:37+08:00`。
- 发布方式：以 `image-cloud-history-20261008-2` 完成后的线上完整应用为基底，仅叠加 `backend/safe-upstream.mjs` 与 `tests/image-provider-security.test.mjs`，通过已授权 SSH 上传 SHA-256 一致的完整发布包，调用服务器现有 `/opt/nikai-ai/scripts/release-production.sh`。
- 发布包 SHA-256：`3a0ab72066a394e059aa9916bf1ee7402ebe91677f242f54c31c1b7da9c013f1`。发布前本机 337 项测试中 335 通过、2 跳过，语法检查和 Logo 校验通过；服务器发布脚本 337 项测试全部通过。
- 代码回滚快照：`/opt/nikai-ai-backups/releases/previous-20261008-101949-image-ipv4-20261008-2`；MariaDB 备份：`/opt/nikai-ai-backups/mariadb/nikai-ai-20261008-102030-1925352.sql.gz`。
- 发布后 `nikai-ai.service` 为 `active`，本机和公网就绪接口返回 `status=ok`、`database=true`；公网 `/image-generation` 与 `/api/v1/image-models` 返回 200。
- 诊断边界：原始 502 是 Node 上游连接失败；服务器无可用 IPv6 路由，而平台 DNS 同时返回 IPv4 与 IPv6。修复后平台鉴权、模型列表与无效模型错误响应均可正常返回。一次真实 `gpt-image-2` 生成请求在四分钟内仍未完成，超过本站 180 秒超时，故尚未验证实际生成成功。需检查平台任务状态或更换能在超时内生成的模型/平台。
