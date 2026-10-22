# 泥壳 AI 工具站端到端审计报告（2026-10-08）

> 2026-10-22历史更正：原移动截图的窗口像素与CSS视口不一致，不能作为横向溢出证据；2026-10-08后续移动仿真未复现该问题。见 [保留原文的复核记录](archive/worktree-catalog-mobile-20261022/full-audit-2026-10-08.md)。下文旧观察保留作历史，不代表当前结论或本次重新验收。

## 一分钟摘要

当前最核心的结构性问题是：前后端已经有明确模块边界，但工具目录读取仍按每条记录逐项查关联数据，MariaDB 又经同步 worker 桥接；本地小数据测得很快，生产数据库和并发下的尾延迟没有实测证据。

此轮完成了本地静态检查、隔离 SQLite 服务实测、权限/CSRF代表性检查、数据库迁移基线导出和桌面/移动页面截图。`npm test` 为 342 项、339 通过、0 失败、3 跳过。工具目录搜索接口本机 SQLite P95 为 3.06 ms，未搜索为 2.86 ms；这是本地串行数字，不代表公网或 MariaDB P95。Core Web Vitals 没有真实用户数据，INP 未实测。移动 390×844 截图显示顶部区域横向溢出。未访问生产、未访问生产数据库、未发布，也未修改项目代码或配置。

已有历史生产检查记录称：MariaDB 日备份 timer 连续失败、生产目录有 595 个 world-writable 文件；因本轮没有重查线上，这两项是“发布前必须核验”的历史 P0，不能据此断言当前仍存在或已经修复。详见 [历史检查记录](project-audit-2026-10-08.md)。

## 审计边界与产物

- 本地工作区、Node 后端与前端源码、SQLite schema 和 19 个迁移、现存测试与依赖锁文件。
- 性能请求发往 `127.0.0.1` 的临时隔离应用和临时 SQLite 数据库；没有对工作区活动数据库或线上服务发压。
- 访问控制实测覆盖 15 个未登录用户作用域请求、5 个未登录管理请求、一个双账号收藏隔离序列和一个跨源 CSRF 请求。不是所有端点的全笛卡尔组合，身份验证/越权结论限于已列证据。
- 未读取生产 MariaDB 的 `information_schema`、慢查询日志、执行计划、备份状态或真实字段排序规则；生产字符集、索引与数据规模因此无法确认。
- [接口实测证据 JSON](audit-interface-evidence-2026-10-08.json)、[数据库 SQLite 迁移基线 JSON](database-schema-audit-2026-10-08.json)、[OpenAPI 3.0.3 契约](openapi-audit-2026-10-08.yaml)、[截图目录](audit-screenshots-2026-10-08/)。

## 项目结构和验证结果

当前为同仓库前后端分离职责、部署上同一 Node 服务：静态页面在 `public/`，Node `http` API 路由在 `server.mjs`，持久层在 `backend/`，SQLite 为本地/测试后端，MariaDB 通过 `mysql2` 和 worker 兼容层供生产使用。页面为原生 HTML/CSS/JS，没有正式前端打包步骤；`package.json` 直接运行前端静态资源。

本机 Node v22.18.0、npm 11.8.0。全量项目测试 `npm test`：342 项、339 通过、0 失败、3 跳过，约 30.7 秒。`npm audit --offline --json` 报告 11 个生产依赖、12 个总依赖、0 条漏洞；由于离线 advisory cache，这不能证明当前 npm registry 没有新公告。

## 性能专项

### 本地接口耗时排行

测量方式：隔离新 SQLite 数据库、种子数据、loopback 串行 HTTP、每接口预热 1 次再测 100 次；延迟包含完整响应体读取。不等同生产压力测试。监控接口受 30 次/分钟限制，样本为 25 次。详细样本见 JSON。

| 排名（P95） | 接口 | 样本 | P50 | P95 | 最大 | 归因判断 |
|---:|---|---:|---:|---:|---:|---|
| 1 | GET `/api/v1/tools?q=AI&limit=24&offset=0` | 100 | 2.32 ms | 3.06 ms | 10.03 ms | 本地 DB 查询与 JSON 组装；代码有多次关联查询，MariaDB 下应优先优化；此数字未证明存在慢 SQL |
| 2 | GET `/api/v1/tools?limit=24&offset=0` | 100 | 2.19 ms | 2.86 ms | 6.23 ms | 同上，工具行逐项 hydrate 的 N+1 是已确认逻辑/查询放大点 |
| 3 | GET `/api/v1/site/bootstrap` | 100 | 1.28 ms | 2.47 ms | 3.60 ms | 多内容汇总读取与 JSON 组装；隔离库不慢，待 MariaDB 复测 |
| 4 | GET `/api/v1/health` | 100 | 0.72 ms | 2.12 ms | 3.54 ms | 数据库探活，生产真实连接成本未知 |
| 5 | GET `/api/admin/v1/monitoring?hours=24` | 25 | 2.05 ms | 3.82 ms | 4.05 ms | 多聚合查询；因本地数据量小无法证明其生产成本 |
| 6 | GET `/api/v1/news/hot?limit=10` | 100 | 0.87 ms | 1.38 ms | 3.62 ms | SQLite 读与拼装 |
| 7 | GET `/api/v1/categories` | 100 | 0.72 ms | 1.08 ms | 2.35 ms | 小表读取 |
| 8 | GET `/api/v1/tools/chatgpt` | 100 | 0.68 ms | 0.97 ms | 1.30 ms | 单工具及关联读取 |
| 9 | GET `/api/v1/image-models` | 100 | 0.58 ms | 0.95 ms | 3.12 ms | 本地列表读取；生图生成的外部调用不是此接口的路径 |
| 10 | GET `/api/v1/articles?kind=news` | 100 | 0.62 ms | 0.84 ms | 2.72 ms | SQLite 列表查询 |
| 11 | GET `/api/v1/site-announcements` | 100 | 0.49 ms | 0.68 ms | 0.99 ms | 小表读取 |

### 慢点、重复计算与预估收益

1. **工具目录的 N+1（P1，当前首要代码优化）**：`backend/database.mjs` 的 `listTools` 对每一行调用 `hydrateTool`，后者分别读取平台、特性、用例、徽标；24 条一页约为计数+分页+96 次关联查询，共约 98 条 SQL 调用。批量 `IN (...)` 取关联项后按 `tool_id` 归组，预计每页查询从约 98 降至约 6（约少 94% SQL 往返/调用）。预计 MariaDB 响应时间下降 20–60%（工程估计，需真实 MariaDB A/B 验证；不是实测收益）。
2. **同步 MariaDB worker（P1/P2，生产并发风险）**：`backend/mariadb-compat.mjs` 通过 `Atomics.wait` 等 worker，单条 DB 慢操作会占住 Node 主线程；超时上限 10 秒。将高频路由渐进迁移到真正异步连接池可恢复事件循环并降低排队尾延迟，无法仅凭 SQLite P95 量化。
3. **日期过滤索引候选（P2，需生产执行计划确认）**：SQLite EXPLAIN 对 `analytics_events.received_at` 范围过滤和 `outbound_clicks.created_at` 范围过滤都显示扫描已有、但前导列不同的 covering index。可评估单列/复合时间索引；创建前须在 MariaDB 以真实数据 `EXPLAIN`、基数和写入负担确认，避免重复索引。
4. **无证据支持通用缓存**：小型公开目录数据可能适合短时 HTTP 缓存/版本号缓存，但内容可由管理端更新。先测读写比例、变更频率和失效需求；现有代码已有 content version / bootstrap 机制，不建议再加 Redis。
5. **外部调用**：生图和工具处理会调用上游，但排行榜中的列表、探活不经过耗时生成路径。不能把上游超时归因到这些 P95；生成端到端需要独立记录连接、首字节、完成时长和模型。

### 前端产物、首屏阻塞与 Core Web Vitals

没有构建产物，因此只能统计静态资源大小，不能提供 chunk 构成或打包 analyzer 饼图。`public/` 静态树（忽略 `assets/vendor` 与 `games`）共 241 个文件约 4.43 MB；JS 约 519 KB，CSS 约 293 KB，HTML 约 287 KB，其他资源约 3.33 MB。主入口 `app.js` 144,216 B（gzip 约 36,216 B）；`design-system.css` 6,820 B（gzip 约 2,159 B）；`styles.css` 本身仅 320 B/ gzip 147 B，但其顺序导入五个 CSS 文件。最大项为 `brand-icon.svg` 614,787 B、`udio.ico` 410,598 B、`brand-icon-512.png` 226,819 B、`julinghui.webp` 195,096 B。FFmpeg WASM 约 32.2 MB，属于工具使用时才需要的重资源，应保持按需载入。

- **首屏阻塞**：HTML 引入主 CSS；主 CSS 再以五个 `@import` 串行拉取 site shell/catalog/content/overlays/responsive，形成 CSS 发现瀑布。CSS 规则会阻塞绘制，建议合并成一条预加载/正常 stylesheet 链接。
- **脚本加载**：Lucide CDN 使用 `defer` 且出现在 `app.js` 前，依赖它的图标初始化等待外部脚本；无 SRI。可本地固定版本或异步按需加载。`app.js` 本身也在主页面加载；后续可按路由拆分工具、账户、对比和管理功能。
- **可延迟资源**：FFmpeg WASM、背景移除/增强等工具代码和素材、非首屏插图及工具详情面板。应用若不在首屏展示，不应抢占初始下载。
- **实测视觉**：390×844 移动截图有顶部导航、搜索/介绍区和操作控件右侧裁切/横向溢出；应先修核心视口布局。截图不能据此推导 LCP/CLS/INP 数值。
- **LCP / CLS / INP**：没有真实用户 CrUX/RUM 数据。本轮没有浏览器性能追踪，INP 无可用值；三项均标注“未实测”，不得伪造。应部署轻量 RUM/CrUX 采集后按路由、设备分位报告。

优化收益估算（待 A/B）：移除五级 CSS 瀑布可省最多约 4 次资源发现往返；本机 50–150 ms RTT 的典型网络估计相当于约 0.2–0.6 秒首屏资源发现时间，不保证实得 LCP。大型未使用功能切 chunk 后，初始 gzip 可能减少约 20–40 KB（以实际 chunk 边界为前提）。压缩/重制 600 KB SVG 与 410 KB ICO 可减少静态传输体积，收益取决于它们是否首屏被请求；需核实 favicon 与品牌使用后再调整。

## 安全专项：OWASP Top 10 对照

风险级别为本地证据下的评估；“无已证实问题”不代表所有生产接口已逐个攻击验证。管理 API 的角色矩阵有多个角色和资源类型，需在预发布环境完成全矩阵请求对比。

| OWASP 类别 | 结论/等级 | 证据与边界 | 修复/后续 |
|---|---|---|---|
| A01 访问控制失效 | **当前抽样无越权证据；残余 P1** | 15 个用户作用域无 cookie 请求均 401；5 个管理接口无 token 均 401。双账号 A 收藏 `chatgpt` 后，B 列表仍空、B 删除后 A 仍保有该收藏。Origin 为 `https://evil.invalid` 的账户 PATCH 返回 403 `csrf_rejected`。证据 JSON。 | 路由盘点后逐条测试成员/管理员/超管、资源归属、ID 替换、方法变体；敏感查询必须从 session 推导 userId。生产未测。 |
| A02 加密失败 | **未发现明文密码；低/中** | 密码用 Node `scrypt` 与随机盐散列；session token 随机生成，DB 存 SHA256 摘要；cookie HttpOnly、SameSite=Lax，Secure 取决于 TLS/代理配置。session 有效期 30 天。 | 核验线上 TLS、`trust proxy`、Secure cookie；评估密码重置/会话轮换、过期策略；外部密钥只能从服务端配置取。 |
| A03 注入 | **未证实 SQL/命令/模板注入；低/中** | SQL 值参数化、目录排序走白名单、LIKE 通配符转义。代码用 `spawn` 参数数组而非 shell 拼接；没有服务端模板引擎。前端存在多处 `innerHTML`，多数动态文本经过 `escapeHTML`，图标名有白名单；未发现已验证可利用 payload。 | 对所有输出源（管理内容、文章来源、用户提交、工具字段）做上下文编码审查；保持 query binding；避免新增 raw HTML。 |
| A04 不安全设计 | **存在可改善项；中** | 内容 revision、请求大小限制、限流和外部 URL 安全策略存在；限流状态进程内，数据库 MariaDB 调用同步阻塞事件循环。 | 发布门禁、幂等语义和配额统一文档化；对长任务采用任务状态/上游超时；多进程限流按部署拓扑评估共享存储。 |
| A05 安全配置错误 | **运行态需核验；中** | 既有历史报告记录响应头 CSP/HSTS/nosniff 正常；本轮未访问线上。默认生产不启用共享管理员 token，生产要求持久数据库与 analytics salt。 | 发布前复核代理、CSP、Secure cookie、CORS/Origin 与环境变量；不将旧线上观察当作当前证明。 |
| A06 易受攻击和过时组件 | **不能下当前无漏洞结论；中** | 离线 `npm audit` 0 条；依赖锁文件存在，依赖数量 12。 | 出网 CI 执行 registry audit 和更新检查；检查静态 vendor、WASM 的来源和许可证，升级先过测试。 |
| A07 身份验证失败 | **未发现绕过证据；中** | 未登录用户与管理接口实测 401；scrypt、token hash、过期校验和停用用户检查存在。没有测暴力破解阈值和线上 session 配置。 | 登录速率限制、恢复流程、会话撤销、角色变更失效策略在 MariaDB 集成环境复测。 |
| A08 软件和数据完整性失败 | **发布链需关注；中/高** | 有锁文件和正式发布脚本；当前本地工作树有大量已有修改，线上与本地基线差异见旧报告。 | 只从审阅过的差异制作发布包，检查包清单/哈希、源 commit、迁移；依赖和静态资源来源固定。 |
| A09 安全日志和监控失败 | **观测不足；中** | 请求有 requestId，错误响应不回显堆栈；管理监控接口存在。没有 P95/慢查询生产仪表盘证据。 | 采集请求时长、状态、SQL 慢日志、上游耗时；日志脱敏，建立告警和保留策略。 |
| A10 SSRF | **有防护，仍应回归；中** | `safe-upstream` 和 URL 校验针对私网/localhost；提交网址使用 HTTP(S) 限制；上游调用传参数。 | 对 DNS rebinding、重定向到私网、IPv6/映射地址、代理设置、重定向次数做预发布回归。 |

### 必须在上线前关闭/核验

1. **P0 发布门禁：**在授权生产发布流程开始前，核验历史报告中的每日 MariaDB 备份失败与代码文件宽松权限是否仍存在；若仍存在，修复备份/恢复验证和包权限规范后再发布。不能由本轮离线检查判定已关闭。
2. **P1 授权覆盖：**预发布环境完成所有用户私有接口的 A/B ID 替换矩阵，以及 admin/superadmin 对所有变更端点的权限矩阵；本轮已测证据仅为列出的接口。
3. **P1 发布基线：**当前工作区与生产分叉；只允许按项目正式发布指引，从当前线上完整版本叠加审阅文件。严禁把整个脏工作区作为发布包。
4. **P1 上游生图体验：**历史生产报告记录一次生成超过四分钟，超过网关 180 秒限制；本轮未复测。若该功能仍在本次发布范围，先确认真实模型端到端在网关时限内完成并审查重试计费。
5. **P2 依赖与浏览器输出：**上线构建前联网审查依赖 advisory；对动态 HTML 源字段补充恶意内容回归。

## 数据库专项

### 全表结构与约束

[完整 32 张表、列类型、默认值、主键、索引、外键与原始 SQLite DDL](database-schema-audit-2026-10-08.json) 来自 `backend/schema.sql` 加 19 个 migration 在全新内存 SQLite 应用。它是本地迁移定义的结果，不是生产 MariaDB dump；迁移没有单独创建生产数据库实况证明。报告 JSON 可逐列审阅，避免在此重复 32 张结构表。

### 索引和执行计划

SQLite 种子数据 EXPLAIN：工具列表 `SCAN t` + `USE TEMP B-TREE FOR ORDER BY`；关键词搜索 `SCAN t`、4 个 correlated subquery 和临时排序；关系表子查询能用各自主键索引。工具表约 27 行，扫描在当前规模合理；不要为了消掉小表扫描盲目加索引。时间聚合按 `received_at`/`created_at` 筛选时，现有索引分别以前导 `session_id`/`tool_id` 开始，因此 SQLite 计划仍扫描覆盖索引。候选方案是 `(received_at)` / `(created_at)`，或结合真实 WHERE/GROUP BY 做复合索引；先在 MariaDB `EXPLAIN ANALYZE` 验证过滤选择性、读写比例和索引冗余。

没有生产 SQL 慢查询清单：本轮未接触生产慢日志。静态检查确认目录列表 N+1，见性能专项。额外重复索引/生产无用索引无法在没有 MariaDB index statistics 与查询频率下可靠判定。

### 类型、字符集、时间、外键

- 当前 SQLite schema 以 TEXT 标识符为主；这是 UUID/slug 文本而非数值自增 ID，没看到“大整数 ID JSON 精度”问题。金额接口/表未发现；工具价格为标签类文本，不应改成 float 金额。今后若有真钱金额使用整数最小单位或 DECIMAL，不能 float。
- SQLite 定义无法证明生产 MariaDB 的 `utf8mb4` 与 collation 是否统一。必须在预发布/正式生产只读 `information_schema` 检查 database/table/column charset、collation，并在 MariaDB `SHOW CREATE TABLE` 确认迁移效果。
- 时间多以 ISO 字符串存 SQLite；事件有客户端时间和服务端 `received_at` 两字段。对 API 统一 UTC ISO 8601 带 `Z`，日期字段固定 `YYYY-MM-DD`，前端按用户地区格式化；MariaDB 实际 TIMESTAMP/DATETIME 和 session timezone 未核实。
- JSON 导出包含每个外键与 delete rule；当前无法把 SQLite foreign key pragma 的 cascade 行为当成 MariaDB 生产行为。逐表核对迁移后删除策略，用户内容采取显式保留/匿名化政策，避免级联误删。
- 备份与恢复：不得直接碰生产数据库。部署前按 `docs/production-release.md` 和正式脚本建立代码与 DB 备份、切换后健康验证及失败回滚；日常需定时 MariaDB 逻辑/物理备份、加密和异机保留、校验摘要，并定期在隔离恢复环境演练。历史报告指出 timer 曾 `203/EXEC`，所以需先核验当前 timer 与成功恢复证据。

## 接口契约与数据规范

可导入 Swagger 的 [OpenAPI YAML](openapi-audit-2026-10-08.yaml) 包含本地路由盘点出的 66 个路径，覆盖健康、公开内容、认证、账户、投稿、订阅、反馈、分析、生图/图片工具、链接提取和管理端；含鉴权、安全 scheme、请求/响应结构、示例、Problem 错误和常用校验规则。由于无生产路由核对，管理权限是按代码现状建模；完整覆盖生产接口须与当前线上 commit 再对照。

- **字段命名：**API JSON 使用 camelCase；数据库列使用 snake_case；两侧只通过 repository 映射。
- **ID：**字符串，不将 UUID/未来 bigint 以 JS number 传递。
- **时间：**UTC ISO 8601、含 `Z`；纯业务日期 `YYYY-MM-DD`；入库/出 API 明确客户端时间与服务端接收时间。
- **金额：**当前没有金额字段或支付模块；若新增金额，整数最小单位或定标 decimal 字符串，明确币种。
- **分页排序：**列表统一 `limit` + `offset`，`limit` 必须正整数且设端点上限，响应 `meta.total/limit/offset`；排序字段从服务端白名单选，方向仅 `asc|desc`，禁止把用户字符串拼 SQL。
- **响应：**成功 `{data, meta?}`；错误 Problem 结构 `{type,title,status,code,requestId,details?}`。前端据 401 登录、403 权限/CSRF、409 冲突刷新、422 字段错误、429 退避、5xx requestId 提示并记录。
- **枚举同步：**`category`、`price`、`rating`、`feedback category/status`、`submission status`、`user role/status`、`image ratio`、`eventName/pageType` 等以 OpenAPI/后端 validation 为唯一字典源；改动应同 PR 更新前端共享字典与接口契约。自由文本枚举不要假装封闭集合。

## 投入产出最高的改造顺序

收益为工程估算，均需在对应的 MariaDB/浏览器环境实测。日期批次按任务紧迫度安排；历史线上 P0 若仍存在则优先级高于一般体验优化。

| 顺序/批次 | 改什么与为什么现在改 | 怎么改 | 改完怎么验证 | 预期收益 | 风险 |
|---|---|---|---|---|---|
| 1 本周必做 | 核验备份 timer、权限历史 P0；这是上线数据恢复和代码完整性的前置条件 | 仅按正式 release 流程检查/修复，演练恢复与文件模式预检 | service 成功日志、恢复抽查、包权限审计、线上健康检查 | 降低灾难性数据丢失/本机篡改风险；不以毫秒计 | 操作风险高，必须在授权发布流程和备份确认下执行 |
| 2 本周必做 | 修 390 宽度水平溢出；核心搜索与导航已在截图裁切 | 检查最小宽度、flex/grid 溢出和固定宽控件，补响应式规则 | 同 viewport 截图、横向 scrollWidth 检查、主要交互走查 | 恢复完整首屏操作；0 字节节省 | 小屏布局回归 |
| 3 本周必做 | 消除工具列表 N+1 | 批量查关联表并分组 hydrate，保持响应 shape | SQLite + MariaDB 查询计数；对照响应；记录并发 P50/P95 | 每页约 98 次 SQL 调用减至约 6；预估 MariaDB 延迟降 20–60% | 大 `IN` 分批、排序/关联字段兼容 |
| 4 本周必做 | 线上基线分叉且依赖安全新鲜度未知 | 形成审阅文件清单；发布前线上对照；联网 CI 跑 npm audit | 包清单与 commit 对应、在线 audit、正式测试通过 | 降低误发布/已知 CVE 风险 | 不能以整工作区替代线上基底 |
| 5 下月 | 记录每路由 P95、SQL 与外部调用分解 | requestId 维度记录直方图、慢 SQL 与上游 connect/TTFB/complete | 真实 MariaDB RUM/APM 仪表盘、告警抽查 | 形成基于证据的优化顺序 | 注意敏感字段脱敏和日志成本 |
| 6 下月 | 逐步异步化 MariaDB 热路径 | 连接池 Promise API，先目录/分析读取，再写路径 | 同负载前后比较事件循环延迟、吞吐和 P95 | 降低 DB 等待期间主线程阻塞与排队 | 改造面广，事务/错误语义回归 |
| 7 下月 | 核验时间聚合索引 | MariaDB 实际 SQL 的执行计划和基数后选复合索引 | `EXPLAIN ANALYZE`、慢查询对照、写入开销 | 大表日期报告避免全索引扫描 | 写放大和重复索引 |
| 8 下月 | 合并五条 CSS import，拆出非首屏功能 | 将页面 stylesheet 平铺；路由/工具代码分块，FFmpeg 保持按需 | 网络 waterfall、gzip chunk、Lighthouse/RUM LCP 前后比 | 最多省约 4 个资源发现往返；首包估计少 20–40 KB gzip | CSS 优先级与首屏样式覆盖变化 |
| 9 以后再说 | 管理 Lucide 外链依赖 | 固定且本地自托管或按需导入；校验许可证 | CSP 下运行、断网/第三方故障场景、图标对比 | 减少外部依赖启动等待，时间收益需测 | 静态包略增，供应链维护转本地 |
| 10 以后再说 | 生产 MariaDB schema/备份恢复常态核验 | 只读 schema drift 报告，定期隔离 restore drill | charset/index/FK 差异报告与恢复 RTO/RPO 记录 | 尽早发现 emoji 丢失、迁移漂移和备份不可恢复 | 检查工具需只读账号、恢复需隔离资源 |

### 不用改的事项

- 目前工具表只有约 27 行，不要为了消除 EXPLAIN 的小表扫描盲目加索引；先优化已经存在的 N+1，并以生产数据复测。
- 不需要为了“现代化”马上引入 React/Vue、Redis 或新的前端打包链；现有 `app.js` gzip 约 36 KB，先处理 CSS 瀑布和大型非首屏资源。
- 不需要将当前字符串 UUID/slug 改成 JS 数字；字符串避免精度问题。
- 没有支付金额时不引入 float/decimal 金额重构；未来加支付再按最小货币单位/定标 decimal 设计。
- 不要重复建立已有复合索引，也不要仅凭 SQLite 小样本推断 MariaDB 索引收益。

### 改完后的目标状态

公开目录一次分页最多做少量批量查询，MariaDB I/O 等待不会卡住整个 Node 事件循环；接口契约、错误码和枚举随代码一起版本化；移动首屏完整可操作；CSS/脚本只下载当前页面需要的部分；生产每个关键路由有真实 P95、慢 SQL、上游时长与关联 requestId；schema、字符集、时间时区和备份恢复能以可复查报告证明；权限测试覆盖用户归属和管理角色矩阵，发布只从经过审阅的完整线上基底叠加改动。

## 本轮结论

本地小数据请求都在毫秒级，当前最确定的性能结构问题是工具目录 N+1 和移动首屏溢出；最大的安全结论限制是生产与 MariaDB 未访问，依赖公告只做离线检查，越权只完成代表性请求。不能把这份报告当成当前线上全量渗透测试或生产 P95 报告，也不能据此发布。建议先核验历史 P0 与当前线上基线，再按上表实施；届时每项改造在预发布 MariaDB 和真实浏览器量化。
