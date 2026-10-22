# 首次创作 Implementation Plan

> **For agentic workers:** Use subagent-driven-development for independent backend work; execute frontend in current session.

**Goal:** 首次用户通过六个案例获得第一张图，清楚知道费用、任务状态与失败后的操作。

**Architecture:** 在既有创作台加案例控制器与可测试纯函数；复用现有异步任务与积分结算。后端摘要/失败结算补充现有接口，不加数据库迁移。

**Tech Stack:** 原生HTML/CSS/JS、Node22、现有SQLite/MariaDB、Node Test Runner。

## Global Constraints

- 隔离目录基于SHA256核验生产完整快照，排除配置、数据库、用户内容和依赖。
- 六图由内置imagegen生成，WebP优化后进入public/assets/image-generation/first-creation。
- 不报虚假耗时、进度和积分退款；断网只查询原任务。
- 保留原五提示词按钮和自由创作，账户间任务不串。
- 唯一发布入口为服务器现有release-production.sh。

## Task 1: Account task context and confirmed settlement

- [x] 写API/存储测试，证明账户隔离、历史删除不重置成功、耗时样本门槛和已结算失败信息。
- [x] 运行测试观察新增行为失败。
- [x] backend/image-job-store.mjs提供summary(userId)，get返回结算；server.mjs提供GET /api/v1/image-creation-context以及失败problem details；static白名单加入新模块；validation新增有限创作事件名。
- [x] 测试通过，自检兼容SQLite/MariaDB与无账户数据泄露。

## Task 2: Cases and recovery frontend

- [x] tests/first-creation.test.mjs覆盖六案例模型匹配、价格阻塞、参考图约束、结算文本与任务恢复语义。
- [x] 运行测试观察缺失行为失败。
- [x] public/first-creation-core.mjs提供案例与纯函数，public/image-generation.js集成案例、价格、轮询恢复、结果统计；HTML/CSS提供视觉。
- [x] 单元测试与浏览器本地API模拟验证失败/成功/断网/恢复/跨账户。

## Task 3: Verify and release

- [x] 干净目录npm ci、语法检查、npm test、logos:verify。
- [x] 审阅修改文件与基底差异，工作区保存本次文件和报告，不拷贝无关文件。
- [x] 完整发布包排除配置/data/node_modules，计算上传SHA256；核对生产未漂移。
- [x] 执行唯一发布脚本，复核就绪、真实页面/资产/API、记录版本与备份。
- [x] 浏览器截图并呈现最终结果。
