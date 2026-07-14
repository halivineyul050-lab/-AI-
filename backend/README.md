# 泥壳AI后端说明

## 技术判断

初始种子包含 28 个工具；当前本地数据库已扩充为 139 条工具记录，其中 138 条已发布，并已按 1,500–2,000 条目录容量改为服务端分页。第一阶段采用 Node.js 内置 HTTP 服务与 SQLite，可零 npm 依赖启动并完成真实持久化；API 契约、实体边界和字段命名按模块化单体设计，生产阶段可以替换为 NestJS + PostgreSQL。

SQLite 负责当前 MVP，不建议直接作为高并发公开生产数据库。正式上线前应迁移 PostgreSQL、托管对象存储和独立管理端。

## 公开 API

所有 JSON 成功响应采用：

```json
{
  "data": {},
  "meta": {}
}
```

错误响应采用 Problem Details 风格并包含 `requestId`。

### 内容

- `GET /api/v1/site/bootstrap`
- `GET /api/v1/categories`
- `GET /api/v1/tools?q=&category=&price=&platform=&language=&sort=&limit=&offset=`
- `GET /api/v1/tools/:idOrSlug`
- `GET /api/v1/articles?kind=tutorial|news`
- `GET /api/v1/articles/:idOrSlug`

`bootstrap` 只返回分类计数、文章、专题和单个推广工具，不再内嵌全量普通工具。工具首屏、搜索和筛选统一通过 `/api/v1/tools` 获取；该接口默认返回24条普通工具并使用 `limit` / `offset` 分页。

分类参数为 `comic` 时会返回“AI 漫剧”工具，并按 `category_sort_order` 保证橙星梦工厂位于首位；该条目仍返回 `sponsored: true`，前端同步展示“推广”标识。其他未指定分类的普通工具列表仍排除推广条目。

### 本地授权目录导入

`npm run catalog:import` 支持 CSV、JSON 和 NDJSON 文件，负责 URL 安全校验、来源分类映射、来源键幂等、官网地址去重和导入报告。新增记录默认进入 `review`，不会直接发布；命令不包含第三方网站抓取逻辑。

来源和批次记录存储在 `tool_sources` 与 `catalog_import_batches`。字段与命令示例见根目录的 `AI工具批量导入与合规说明-2026-07-14.md`。

资讯记录额外返回 `source` 与 `sourceUrl`，前端详情页提供官方原始发布入口。当前内容同步会更新本轮策划工具和资讯，同时归档被替换的旧推广位与占位资讯。

### 投稿

`POST /api/v1/tool-submissions`

```json
{
  "name": "产品名称",
  "websiteUrl": "https://example.com",
  "categoryId": "coding",
  "summary": "一句话介绍，至少十个字符",
  "contactEmail": "owner@example.com",
  "declarationAccepted": true,
  "source": "sidebar",
  "company": ""
}
```

建议传入唯一的 `Idempotency-Key` 请求头。相同工具 URL 已有待审核记录时返回 `409`。

成功响应同时返回 `trackingCode` 与 `lookupToken`。查询审核状态：

```text
GET /api/v1/tool-submissions/:trackingCode/status?token=:lookupToken
```

### 周报

`POST /api/v1/newsletter/subscriptions`

```json
{
  "email": "reader@example.com",
  "topicSlugs": [],
  "consentVersion": "2026-07",
  "consentAccepted": true,
  "source": "news_sidebar"
}
```

当前版本保存真实订阅记录，但尚未接入邮件发送和双重确认服务。

成功响应会返回 `unsubscribeToken`，退订接口为：

```text
DELETE /api/v1/newsletter/subscriptions/:unsubscribeToken
```

### 埋点

`POST /api/v1/events/batch`，单批最多 50 条；`eventId` 为幂等键。

```json
{
  "visitorId": "visitor-uuid",
  "sessionId": "session-uuid",
  "events": [
    {
      "eventId": "event-uuid",
      "eventName": "page_view",
      "clientTime": "2026-07-13T12:00:00.000Z",
      "pageType": "tools",
      "path": "/#tools",
      "properties": { "viewport": "1440x900" }
    }
  ]
}
```

### 官网跳转

`GET /r/tools/:toolId?placement=detail_drawer`

目标 URL 只从数据库读取，接口不接受任意外部 URL，因此不会成为开放重定向器。点击写入失败时仍优先完成跳转。

## 管理 API

必须配置 `NIKE_ADMIN_TOKEN`，并使用 Bearer Token：

- `GET /api/admin/v1/monitoring?hours=1|6|24|72|168`
- `GET /api/admin/v1/summary`
- `GET /api/admin/v1/submissions?status=pending`
- `PATCH /api/admin/v1/submissions/:id`

审核请求：

```json
{
  "status": "approved",
  "reviewNote": "资料完整"
}
```

审核动作会写入 `audit_logs`。当前令牌方案只适合本地原型；生产必须替换为管理员账户、短效会话、MFA、RBAC 与 CSRF 防护。

### 实时监控

可视化后台位于 <http://127.0.0.1:4173/admin.html>，默认每 5 秒请求一次监控快照。快照包含：

- PV、UV、最近 5 分钟活跃 Session 与事件速率
- 搜索、工具卡片点击、详情访问、官网跳转、广告 CTR
- 小时趋势、访客转化漏斗、热门工具与热门搜索
- 最近事件、投稿状态、服务响应时间、内存和 SQLite/WAL 大小

开发环境中，仅当 Socket、`Host`、`Origin` 和 `Sec-Fetch-Site` 均证明请求来自可信本机时，才允许匿名只读访问；匿名结果不返回搜索词或事件明细。携带有效 Bearer Token 后返回管理视图。生产环境始终要求 Token。后台 HTML 和所有管理 API 响应均使用 `no-store, private`。

## 安全边界

- 请求体默认上限 64 KB，事件批次上限 128 KB。
- 公共读取、投稿、订阅、事件和跳转采用不同限流桶。
- 投稿 URL 只允许 HTTP/HTTPS，拒绝凭据 URL、本地地址和私有网段。
- 未知请求字段直接拒绝，分类必须在服务端存在。
- 邮箱规范化后使用唯一约束；客户端不能修改审核状态或累计指标。
- 事件只接受白名单名称，IP 仅保存 HMAC 哈希。
- 原始事件和官网点击默认保留 90 天，启动时及每日自动清理。
- 同一 Session 对同一工具位置的 10 秒内重复跳转不会重复计数，并过滤常见预加载与爬虫请求。
- 管理 API 默认关闭，审核状态和审计日志在同一事务内写入。
- 后台不加载第三方可执行脚本，管理令牌仅保存在前端运行内存。
- 本机只读监控校验可信 Host 和浏览器请求来源，避免 DNS Rebinding 将 loopback 当作认证。
- CSP、`nosniff`、拒绝嵌入和严格 Referrer Policy 已在服务端设置。

生产模式要求显式配置持久化 `NIKE_DB_PATH` 与稳定的 `NIKE_ANALYTICS_SALT`，否则服务拒绝启动；生产模式也不会自动导入演示数据或开启共享令牌管理接口。

## 生产迁移路线

1. 用 Prisma 或 Drizzle 将 `schema.sql` 映射到 PostgreSQL。
2. 保持 `/api/v1` 响应字段不变，将数据访问层替换为 PostgreSQL Repository。
3. 使用 `pg_trgm` 完成中文名称和摘要模糊搜索。
4. 将管理鉴权替换为账户、MFA、RBAC 和轮换刷新令牌。
5. 增加 Redis + BullMQ，承担邮件、链接巡检、图片处理和 Sitemap 任务。
6. 使用 S3 兼容对象存储与 CDN 托管 Logo、截图和文章封面。
7. 将前端升级为 Next.js/Nuxt SSR 页面，提供可索引的工具和文章独立 URL。
