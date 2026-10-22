# 交互讲解项目管理发布记录

- 发布：`explainer-projects-20261019-1`，2026-10-19 15:19:45 +08:00，服务器 release history 为 success。
- 正式通道：已授权 SSH 上传完整包，调用服务器既有 release-production.sh。基底为当前生产 explainer-video-20261019-2，只覆盖 reviewed-files.json 中12个审阅文件，不包含工作区无关改动。
- 功能：创作页和演示页项目管理，按账号显示原有服务端历史；搜索/状态筛选/分页；成功恢复演示与视频入口，进行中恢复原任务轮询，失败显示原因并带回编辑，不自动新增调用。
- 包 SHA256：`2b62136ad84ea234315963898f8dc2c6b156a0f68bf578e4984beceeba32b5b7`，上传前后相同。
- 代码回滚：`/opt/nikai-ai-backups/releases/previous-20261019-151503-explainer-projects-20261019-1`。
- 数据库备份：`/opt/nikai-ai-backups/mariadb/nikai-ai-20261019-151933-2406036.sql.gz`；无需新迁移。
- 本机 Node22.18.0：774项，771通过，3Windows平台跳过，0失败；全部前端脚本与入口语法检查通过；138个logo资产验证通过。
- 服务器干净目录：774/774通过，0跳过0失败，发布成功；切换重启时首次探测连接拒绝后正常就绪，最终 service active、ready200/database=true。
- 公网：https://ontimo.cn/explain 缓存20261019-projects-1；新资源200；匿名历史API401且无私有卡片；桌面搜索宽532px；390px手机无横向溢出；pageErrors=[]。
- 登录态本机真实数据库浏览器回归覆盖：历史场景打开与刷新、筛选、分页后原卡片、失败恢复、进行中不新增任务、网络重试、退出不泄漏与迟到URL响应。公网未冒用用户账号；生产数据库只读聚合与SQL兼容查询通过。
- 独立复核通过，证据位于 `docs/explainer-projects-evidence-20261019/`。旧VM测试只补全浏览器依赖，断言不变。

- 清理：删除本次独立暂存目录的 PowerShell 操作被自动审批策略 blocked by policy 拒绝，未绕过；C:/Users/zhanglian2/.codex/release-staging 中本次临时发布文件暂留，不影响线上。
