# 生图任务可靠性实施计划

目标：修复进程中断导致新任务失踪、积分无人结算的问题，保持公开接口兼容。
设计与全局约束见 `docs/optimization-plan.md`。用户已授权按审阅建议开始执行；本会话逐项实现，不新增代理或重复审批。

## 任务 1：持久任务与积分事务

- [x] 新建 `tests/image-job-recovery.test.mjs`，验证预留和任务同时提交/回滚、恢复幂等、已结算不退款、旧预留不变、所有者隔离、过期 pending 不删除。
- [x] 运行 `node --no-warnings --test tests/image-job-recovery.test.mjs`，记录失败；任务实现前六项失败。
- [x] 添加两套迁移 030 并注册 SQLite/MariaDB 迁移；更新现有迁移数量断言。
- [x] 在积分 reserve/settle 内增加同步事务回调；实现 `createImageJobStore(db, creditStore)` 的 reserve/get/complete/fail/recover/prune/assertCapacity/isPendingReservation。
- [x] 运行新测试及 credits、MariaDB 兼容与生产迁移测试。

## 任务 2：Service 与 API 接入

- [x] 补重启 API 集成测试：pending 变安全中断错误并退款、完成响应跨启动可查、用户隔离、上游不重放；接入前两个重启测试均返回 404，符合待修复问题。
- [x] 实现 `createImageGenerationService({ jobs, creditStore, imageGateway, imageCloudHistory, imageResults, activeCreditReservations, logger })`，返回 prepare/run/close；查询与清理由 jobs 直接提供，避免无意义的转发方法。
- [x] 替换入口中的生图业务块，保留模型校验、请求体限制、登录、同源校验、限流和错误文案。
- [x] 运行生图、积分、云历史、权限回归，首轮 123 项全部通过。
- [x] 补充独立审查建议：全站容量、跨启动非所有者查询、关闭服务时拒绝新预留。关闭测试先失败，再修复并通过。

## 任务 3：完成第一批验收

- [x] 审阅入口、积分与迁移注册相对开工快照/原始读取的差异；生成明确的本批代码范围清单。工作区全量 Git diff 含既有改动，不能作为本批发布包。
- [x] 修改模块 `node --check` 通过；完整 `npm test` 已执行：552 通过、3 既有失败、3 跳过；`npm run logos:verify` 通过。完整测试未全绿，未达到发布门槛。
- [x] 更新优化方案的执行记录、实际测试结果、未完成项与生产验证边界。
- [x] 留下本地可审阅结果；未提交、推送或上线。
