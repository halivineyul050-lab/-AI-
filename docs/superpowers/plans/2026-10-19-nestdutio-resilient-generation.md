# NeStudio 分文件生成与恢复 Implementation Plan

> For agentic workers: Use subagent-driven-development to implement scoped tasks and review results. 用户已授权开发、测试、完成后上线。

**Goal:** 分文件生成网站、有限恢复截断、持久化完整文件、显式恢复中断任务，保留真实验收与积分语义。
**Architecture:** 保留artifact v1和checker，通过manifest及独立文件响应组装作品；jobs通过回调存取检查点。时间线沿用原形式。
**Tech Stack:** Node22.18.0，SQLite/MariaDB，原生浏览器JavaScript，现有沙箱Chrome。

## Global Constraints
- 正式生产基底explainer-projects-20261019-1，独立目录C:/Users/zhanglian2/.codex/release-staging/nikai-resilient-20261019。根工作区脏，不整包发布。
- 最终30文件/单文件256KiB/总2MiB；清单首版最多12；原验收/forms/capabilities冻结。
- 24次上游HTTP请求，600秒总deadline，保留60秒检查，单次沿用配置60–180秒；文件重生成一次，整体验证修复两轮。
- 固定积分成功只结算原一次，失败退款；Token实际用量全计且不超预算。未知上游结果不自动重放。
- 沿用唯一production-release.md流程，所有检查通过再调用既有发布脚本。

## Shared interfaces
- generator.run({prompt,base},callbacks)：existing callbacks不变，新增resumeCheckpoint（可为空对象）、onCheckpoint(snapshot)。
- snapshot: {schemaVersion:1,promptHash,baseHash,configHash,plan:{name,capabilities,forms,acceptance},manifest:{entry,files:[{path,purpose,dependencies:[]}]},files:[{path,content}],...安全内部恢复元数据}。摘要/验证实现统一由generator与checkpoints模块协调。在checkpoint读入前由generator再次验证需求/基底/配置指纹，不接受浏览器源码输入。
- Progress safe events新增manifest_validated/file_started/file_saved/file_retry/file_split/checkpoint_reused；file/path字符串只允许artifactPath，index/total/attempt安全整数。file用于路径，界面映射为可读名并显示路径。
- callbacks.onCheckpoint在计划/清单验证后、完整文件校验后await；部分或截断文件不得保存。
- GET tasks响应generation:{completedFiles,totalFiles,currentFile,canResume,checkpointExpiresAt,resumedFromTaskId}。
- POST tasks/:id/resume带requestKey、billingRevision、baseVersion及Token模式maxCredits。创建新任务，重用合法快照，新的执行单独按公开规则计费。

## Task 1: generator protocol (owner generator agent)
Files: generator.mjs，新增generation-manifest.mjs/provider-request.mjs如需要；相关生成测试。
- [ ] 先增加可重复上游假响应测试：manifest+逐文件、第二文件length只重试第二文件、验收不变、24调用与时间边界。
- [ ] 提取安全请求层和有限usage/截断处理，保留response_format fallback但计入实际HTTP请求上限。
- [ ] 单次规划包含manifest；为已有上游兼容测试保留无manifest的旧整包协议路径，但真实提示必须请求manifest。manifest逐文件完整JSON响应{path,content}，不拼接截断。
- [ ] 完整文件保存检查点，恢复验证指纹，只重用已完整验证文件；无法安全完成的拆分直接有限失败，不隐式删功能。
- [ ] 组装原artifact并调用checker，局部修复最多2轮，确保最终acceptance/forms/capabilities固定。

## Task 2: checkpoints/jobs/resume (owner backend agent)
Files: 新增generation-checkpoints.mjs，jobs.mjs/routes.mjs/service.mjs，SQLite/MariaDB迁移041，数据库及API测试。
- [ ] 先测账号隔离、退款后创建新执行、同key去重、版本变化冲突、过期不能恢复。
- [ ] 服务端JSON检查点存储和30天清理，事务保存，提供安全generation摘要；浏览器不回传快照。
- [ ] generator callbacks持久化；重启沿用中断退款，保留快照；终态failed且有文件才canResume。
- [ ] 恢复创建新task关联oldtask，固定快照、原prompt/base、重用原公开费率校验与预算；防止直接变更旧终态扣费。
- [ ] 两种计费与旧仅033 fixtures兼容，迁移完整服务启用新能力；不放宽鉴权或做未知请求重发。

## Task 3: progress UI (owner frontend agent)
Files: progress.mjs，public/nestdutio.js/html/css按需，UI测试。
- [ ] 先测安全新事件持久化和可读文案、实时文件计数、无伪进度、重试及终态原因。
- [ ] 保持竖线聊天时间线，展示当前文件、真实完成数、文件恢复；更正HTTP响应头已到不代表内容接收完整。
- [ ] canResume时显示继续生成，明确新执行的预留/预算费用，复用现有提交确认流程调用resume端点；普通断网只查询原任务。
- [ ] 更新缓存标识，1440/390真实浏览器验证无横向溢出；历史任务无generation照常显示。

## Task 4: integration/review/release (owner root)
- [ ] 审核各范围差异与设计一致性，特别检查点指纹、重复收费、超时和错误恢复。
- [ ] 合并接口，定向测试，真实沙箱集成测试；有失败定位原因，不弱化原断言绕过。
- [ ] 独立代码审查，修复重要问题，保存证据。
- [ ] Node匹配服务器，npm ci、全部语法、npm test、logosverify。完整归档仅叠加本次审阅路径。
- [ ] SHA上传核验、release-production脚本、服务与公网API/浏览器验证、发布记录、清理本次暂存（自动策略拒绝则保留并说明）。

## Notes
本计划限定首版同文件完整重生成；受控拆分如无法保证原接口则不启用，不能宣传已自动拆分。真实服务商小批验证若需要新付费调用，先复用现有用户明确授权任务预算，不能冒用用户或凭空创建付费任务。
