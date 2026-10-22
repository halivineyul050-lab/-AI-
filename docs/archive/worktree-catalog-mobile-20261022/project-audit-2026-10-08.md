# 泥壳 AI 工具站检查记录（2026-10-08）

## 范围与证据

只读检查了当前工作区、关键后端/前端/发布代码、测试、已授权生产主机的服务与定时任务、文件权限、公开 HTTP 接口。未修改线上服务、数据库、配置或内容。工作区有 116 个已跟踪文件修改、1 个删除和 59 个未跟踪路径；当前 Git 分支 `cursor/restructure-public-docs-examples` 与线上发布版本不是同一状态，因此本地测试结果不能直接代表生产测试结果。

本地 Node v22.18.0：`npm test` 共 336 项，333 通过、1 失败、2 跳过；8 项 Python 图片测试通过；`npm run logos:verify` 核对 138 条记录和 138 个资源。生产发布脚本在最近一次发布中运行 337 项测试，全部通过。

生产版本 `image-ipv4-20261008-2` 的 `nikai-ai.service` 为 `active`，就绪接口返回 `status=ok`、`database=true`，根文件系统使用率 36%，进程内存约 49 MB。公网首页、后台、生图页、工具列表、搜索、模型列表返回 HTTP 200；未登录生图和后台接口返回 401；HTTP 转 HTTPS 为 301，HSTS、CSP、`nosniff` 等响应头存在。

## 已确认问题

### P0：每日数据库备份失效

`nikai-db-backup.timer` 处于 enabled/active，但 `nikai-db-backup.service` 在 10 月 4–8 日每天都以 `203/EXEC` 失败。该 service 的 `ExecStart` 仍指向 SQLite 时代的 `/opt/nikai-ai/scripts/backup-database.sh`，而生产数据库是 MariaDB。该脚本线上权限为 `-rw-rw-rw-`，没有执行位，因此 systemd 无法启动。10 月 8 日存在发布脚本创建的 MariaDB 备份（最近一次压缩包通过 `gzip -t`），但日常无发布时不会按计划备份。

建议：通过经过审阅的运维变更把定时 service 指向当前 MariaDB 备份入口，修正脚本权限并执行一次 service；检查新备份的摘要与恢复演练。不要把发布时备份当成定时备份。

### P0：生产代码文件对所有本地用户可写

在排除 `node_modules`、`data`、`imports` 后，`/opt/nikai-ai` 仍有 595 个 world-writable 文件；`server.mjs`、`backend/safe-upstream.mjs`、`public/admin.js` 均为 `-rw-rw-rw- root:root`。应用进程 `nikai` 和其他本地账号可改动生产代码，破坏代码完整性。最近两个旧版本快照同样存在该权限，说明不是 10 月 8 日单次发布引入。真实 `.env` 为 `640 root:nikai`，`.mariadb.cnf` 为 `600 root:root`。

发布脚本只对发布/回滚脚本显式设为 `750`，其余文件沿用上传包中的模式。应在完整发布包制作和服务器暂存阶段规范化文件/目录权限，并在发布预检中拒绝 world-writable 代码和不可执行的必需脚本；先用同一正式发布流程验证，再处理现有部署。勿直接编辑线上应用目录。

### P1：生图端到端仍未恢复

IPv4/IPv6 连接故障已发布修复；平台鉴权、模型列表和无效模型响应已验证。实际 `gpt-image-2` 生成诊断超过四分钟未返回，而网关硬上限为 180 秒。故用户仍可能遇到超时。需要平台任务日志或经验证可在时限内完成的模型/平台；只增加重试可能造成重复计费。

### P1：工作区测试与线上版本分叉

本地 `tests/admin-layout.test.mjs:30` 强制要求 `admin.css` 包含 `:focus-visible`，而实际通用焦点样式在 `public/design-system.css:150`，且后台 HTML 已引入该文件。线上测试已改为检查共享样式，本地测试仍是旧断言，因此本地完整测试失败。需整理 176 个工作区改动与线上完整版本的关系，恢复一条可测试、可追溯的代码基线；不要整体发布当前脏工作区。

## 代码层风险（尚无线上事故证据）

### P2：限流键可能长期累积

`server.mjs:211–230` 的限流器用进程级 `Map` 保存 IP/接口键；新键进入和过期键重置都会提前返回，清理逻辑只在已有未过期键被再次命中且表超过 5000 项时运行。持续只有一次请求的新 IP 可让表长期增长。建议定期清理或使用有容量上限的结构，并以大量不同键的测试验证。

### P2：云端生图历史缺少总容量约束

`backend/image-cloud-history.mjs` 限制单图为 10 MB，但 `save()` 无每用户条数、总字节数或保留期限限制；测试明确允许超过 50 张。数据直接以 BLOB 存 MariaDB，服务端读取和写入又经过同步兼容层。当前线上历史表为 0 行，风险尚未形成。建议定义容量/保留策略并监测表大小，保证清理不会静默删除用户内容。

### P2：慢数据库查询阻塞整个 Node 主线程

`backend/mariadb-compat.mjs:104–113` 通过 `Atomics.wait` 同步等待数据库 worker，最长 10 秒。单条慢查询期间同一进程无法处理其他 HTTP 请求。建议先记录慢查询与超时，再逐步把高频读写迁移到异步 MariaDB 池。

### P2：CI 不检查直接推送 main

`.github/workflows/ci.yml` 有 `pull_request` 触发，但 `push.branches-ignore: [main]`。若直接推送 main 而没有经过 PR，CI 不会运行。根据团队分支保护策略决定是否补充 main 的 push 检查。

## 本次未覆盖

没有进行破坏性渗透测试、真实付款生图的多模型压测、数据库备份恢复演练、跨浏览器完整视觉回归，也没有核查外部图片平台后台日志。上述结论仅覆盖本次可验证的代码与运行状态。
