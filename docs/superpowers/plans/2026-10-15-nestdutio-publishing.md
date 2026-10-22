# NeStdutio 托管发布实施计划

> **For agentic workers:** Use executing-plans inline. Build on the approved design and verified phase-one generator.

**Goal:** 已检查的作品在平台子域名上线，支持更新、下线和回滚，失败不替换旧版。

**Architecture:** 独立只读作品 HTTP 监听，由 Nginx 的 apps 通配站点转发。主站 API 管理发布，预览与作品端口分开。不可变版本保存在数据库，发布改变事务保护的指针，不执行模型服务端代码。

**Verified prerequisites:** 两条 DNS 通配记录已生效；nestdutio-wildcard 证书已签发，2027-01-13 到期，尚无自动续期；nikai 账号开启沙箱运行 Chromium 153 已实测。主站登录 Cookie 不带 Domain 属性。

## Tasks

- [x] 新增 publications.mjs，提供 publish/get/unpublish/rollback。034 迁移保存 slug、候选、线上和上一版本、状态及时间；并发发布拒绝。
- [x] 红测跨账号访问、slug 冲突、非法版本、健康检查失败保留旧版、实际回滚、下线、重启中断恢复。
- [x] 独立托管按 Host 与版本返回静态资源。候选仅在随机临时路径可读；正式地址不暴露草稿。错误 Host、路径穿越和非读取请求拒绝。
- [x] 发布链：保存候选 → HTTPS 请求核对版本头 → 原子切换 → 公网正式地址核对版本头；失败恢复原版本。不允许忽略 TLS 错误。
- [x] routes 与 UI 增加发布、状态、下线和回滚；只展示实际发布结果。
- [x] Nginx 独立站点：apps 转发 4186，preview 转发 4185，传递 Host，使用已核验通配证书。nginx -t 成功后 reload；配置失败恢复，主站不切换。
- [x] systemd 外部配置提供预览/托管 origin 与端口。源代码仍通过完整测试包和既有 release-production.sh 发布，不直接编辑线上源文件。
- [x] 本地及服务器完整测试通过后，验收真实子域名 HTTPS、首次发布、草稿隔离、更新、回滚和下线，记录版本与备份。

自定义域名、云端表单和独立后端导出属于下一阶段，当前不能标为完成。证书续期尚需落实，不能误报自动化。


执行记录：见 docs/deployment-nestdutio-20261016-1.md，2026-10-16 完成子域名托管首版公网验收。
