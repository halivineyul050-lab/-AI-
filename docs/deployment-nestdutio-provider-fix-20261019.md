# NeStudio 真实模型输出修正发布

- 发布 ID：`nestdutio-provider-fix-20261019-1`
- 时间：2026-10-19 19:11:16 +08:00，release history success，发布脚本退出 0。
- 基底：线上完整版本 `nestdutio-resilient-20261019-1`，生产快照 SHA-256 `16001fe41e93e7892243649537b7eb2a3d9b30b431920e097c9e2d638308ab97`。
- 审阅覆盖范围：生成器、对应回归测试和设计记录，共三文件；[文件摘要](nestdutio-budget-evidence-20261019/reviewed-files.json)。未发布其他工作区改动、配置、密钥、数据库或用户内容。
- 完整发布包 SHA-256：`7f9b4f074b5f26a935bca0151daf63d309486d6ffcc2b82e6d0a0789e85b0984`，上传后相同。仅调用既有 `/opt/nikai-ai/scripts/release-production.sh`。
- 代码回滚快照：`/opt/nikai-ai-backups/releases/previous-20261019-190552-nestdutio-provider-fix-20261019-1`。
- 数据库备份：`/opt/nikai-ai-backups/mariadb/nikai-ai-20261019-191101-2421062.sql.gz`。本次无新增迁移。

根因取证：原单文件硬上限6000与后台配置16009不一致；真实 DeepSeek flash 请求即使16009也全部耗于reasoning、content为空。关闭思考后正常结束，但长源码JSON字符串无效。原文协议需兼容模型附带文件名的头，同时必须为每轮文件设置明确路径和CSS/JS职责，防止非入口文件重复输出完整HTML。

最终修正：文件请求使用配置上限并保持钱包预算约束；已知DeepSeek别名发thinking disabled；规划保持JSON，单文件用有明确结束标记的原文；保留旧JSON兼容、路径/语法/大小/完整性校验、调用次数限制、截止时间、用量统计、检查点与真实浏览器验收。

验证：本地Node22.18.0全量798项，795通过、0失败、3项Windows平台跳过。服务器干净环境798/798通过、无跳过。server/public语法检查、138项logo验证通过。生成回归14/14，含真实DB/Chrome/checker集成合计15/15；新回归先红后绿。独立复审未发现P1/P2。

真实模型验证使用线上当前DeepSeek及原失败任务的既有规划，在内存载入待发布生成器、隔离预览执行；4个文件仅4请求全部完整返回，并通过全部4项真实浏览器验收。未改动用户原任务或积分，未保存/打印密钥。[真实完成证据](nestdutio-budget-evidence-20261019/live-complete.log)。实际模型请求预算限定16009，低于验证时管理员已调整的31999配置；没有改动后台配置。

发布后服务active，内网及公网ready HTTP200/database=true。页面与JS/CSS HTTP200，手机390px无溢出，pageErrors为空，未登录resume返回401。线上生成器SHA-256 `65f622da6da65832d0e1a34b79f38eaf81587f71c757b583da16b428cd51973b` 与审阅文件一致。本次仅后端修正，页面缓存版本保持既有 `20261019-resilient-1`。

旧失败任务未自动重跑；没有完整保存文件的任务需重新提交。真实用例通过不代表所有需求或上游模型都保证成功。[核验目录](nestdutio-budget-evidence-20261019/)。

清理：自动审批策略拒绝临时发布目录的递归删除，未尝试绕过；`C:/Users/zhanglian2/.codex/release-staging/nikai-budget-20261019` 及本次临时文件保留，不影响线上。
