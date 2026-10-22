# 泥壳AI后端说明

## 技术判断

项目由 Node.js 内置 HTTP 服务提供 API。SQLite 用于本地开发与自动化测试，生产环境使用 MariaDB 10.5，通过 `mysql2` 连接。数据库选择由 `NIKAI_DB_ENGINE` 控制；生产数据库凭据只能放在服务器受限权限的环境文件中。

2026-10-22生产版本为news-persistence-20261022-1，服务与数据库就绪；迁移019已补入，详情sources与热榜只读API已核验上线。热榜页面保持隐藏。证据见 [最终收尾记录](../docs/final-closeout-2026-10-22.md)。

生产当前为单机 Node.js + MariaDB + Nginx。迁移到其他数据库、对象存储或多实例架构属于未来扩展，不是当前上线前置条件。

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
- `GET /api/v1/news/hot?limit=10`（已上线，页面热榜仍隐藏）

`bootstrap` 只返回分类计数、文章、专题和单个推广工具，不再内嵌全量普通工具。工具首屏、搜索和筛选统一通过 `/api/v1/tools` 获取；该接口默认返回24条普通工具并使用 `limit` / `offset` 分页。

分类参数为 `comic` 时会返回“AI 漫剧”工具，并按 `category_sort_order` 保证橙星梦工厂位于首位；该条目仍返回 `sponsored: true`，前端同步展示“推广”标识。其他未指定分类的普通工具列表仍排除推广条目。

### 本地授权目录导入

`npm run catalog:import` 支持 CSV、JSON 和 NDJSON 文件，负责 URL 安全校验、来源分类映射、来源键幂等、官网地址去重和导入报告。新增记录默认进入 `review`，不会直接发布；命令不包含第三方网站抓取逻辑。

来源和批次记录存储在 `tool_sources` 与 `catalog_import_batches`。字段与命令示例见 `docs/AI工具批量导入与合规说明-2026-07-14.md`。

Logo 维护命令为 `npm run logos:sync`，校验命令为 `npm run logos:verify`。Logo 文件只从安全的 `/assets/tool-logos/<slug>.<ext>` 路由提供，Manifest 记录官方来源地址、来源类型、文件哈希、MIME 和核验日期；官网不可访问时会明确标记为域名 favicon 兜底。

**已发布接口能力**：资讯记录额外返回 `source` 与 `sourceUrl`，详情响应增加 `sources` 文章来源列表，同时保留原字段兼容旧客户端。`GET /api/v1/news/hot` 返回近 48 小时热点，`limit` 默认为 10 且只接受 1–10 的整数；响应中的 `windowHours`、`halfLifeHours`、`generatedAt` 和 `items` 分别说明统计窗口、衰减半衰期、生成时间和排序后的文章。每条热点包含排名、来源站点数、来源名称、最新来源时间和 `new`、`rising`、`surge` 标记，不公开内部热度值。热榜要求至少两个规范化主机名不同的来源站点，同站点报道只计一次。详情来源只接受 HTTP/HTTPS 链接。

当前内容同步会更新本轮策划工具和资讯，同时归档被替换的旧推广位与占位资讯。

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
  "termsAccepted": true,
  "source": "sidebar",
  "company": ""
}
```

建议传入唯一的 `Idempotency-Key` 请求头。相同工具 URL 已有待审核记录时返回 `409`。

成功响应同时返回 `trackingCode` 与 `lookupToken`。查询审核状态：

```text
GET /api/v1/tool-submissions/:trackingCode/status?token=:lookupToken
```

### 交互讲解自由生成

`POST /api/v1/explain/generate` 接收 `{ question, level, mode }`，需要登录；沿用运营中心AI助手的接口、模型、加密密钥与每日额度，并与助手并发互斥。问题上限1000字，成功占用1次，失败退回，最多自动修复一次且不重复计次，总调用时限60秒。按用户每分钟最多3次请求。

模型输出经过 `public/explain-scene.mjs` 的结构、表达式及参数边界校验，由受控SVG渲染器显示；不运行模型返回的HTML或JavaScript。服务端请求上限12000输出token，Step 3.5/3.7 Flash及指定推理模型使用low推理档。模型知识内容仍需核验。最近一次结果可保存在本设备，显式分享链接包含演示场景和参数，不是账号云历史。

### 周报订阅接口

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

当前版本保存真实订阅记录，使用服务器每周一09:15–09:30（北京时间）的现有定时任务发送周报。三个通知选项分别控制精选、新工具与收藏更新栏目；退订、压制、禁用账号及全部关闭不会发送。同一订阅每周成功发送一次，失败不记成功，可重跑补发。邮件提供无需登录的确认退订页（GET仅展示，POST取消）；尚未实现订阅双重确认。

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

### 反馈邮件通知

有效反馈先写入后台记录，再异步发送通知。收件地址配置在服务器FEEDBACK_EMAIL_TO；发件地址优先FEEDBACK_EMAIL_FROM，未填时复用已验证AUTH_EMAIL_FROM。RESEND_API_KEY只存服务器配置。邮件包含反馈类型、提交时间、页面、联系邮箱与正文；通知失败不影响已存反馈，服务商返回消息ID后才记录发送接受成功。

### 图片创作与恢复（已上线）

- `GET /api/v1/image-creation-context`：登录后读取是否曾成功、本人待确认任务与具备至少20个成功样本的模型耗时范围；按账户隔离且禁止缓存。
- `POST /api/v1/image-generations`：异步提交支持 `Prefer: respond-async`，202响应包含任务ID和预留积分；按实际成功图片数结算。
- `GET /api/v1/image-generation-jobs/:id`：查询原任务，不重复提交。失败响应仅在结算已确认时提供 `details.settlement`。
- 短期任务结果载荷15分钟过期，任务元数据保留7天；账号云历史是另一个持久化出口。任务查询过期后先核对云历史与积分。
- 首次案例内容与文案见 [设计说明](../docs/superpowers/specs/2026-10-14-first-creation-design.md)。前端记录创作浏览、案例选择、提交、成功、失败和下载事件，事件不包含提示词或图片。

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
- 最近事件、投稿状态、服务响应时间、内存和当前数据库后端的状态

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

生产模式要求使用持久化数据库与稳定的 `NIKE_ANALYTICS_SALT`，否则服务拒绝启动；生产模式也不会自动导入演示数据或开启共享令牌管理接口。MariaDB 连接变量为 `NIKAI_DB_NAME`、`NIKAI_DB_USER`、`NIKAI_DB_PASSWORD`，可选本地 socket `NIKAI_DB_SOCKET`。

### 图片模型平台生产配置

为平台 API Key 配置独立的 32 字节主密钥，并且只将它保存到服务器环境或权限为 `600` 的部署密钥文件中。生成一次随机值：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

将命令输出完整写入 `NIKE_IMAGE_CONFIG_KEY`。它必须是 64 个十六进制字符，不能提交到仓库、写入浏览器或放进日志。缺少或格式无效时，后台仍可读取已脱敏的平台配置，但保存 API Key、测试连接和生成图片都会以 `image_service_unconfigured` 拒绝；配置密钥后重启服务即可恢复这些操作。

管理员监控响应的 `system.imageGenerationConfigured` 仅表示该主密钥是否可用，不表示已经配置并启用了可生成图片的模型。公开 `/api/v1/health` 与 `/api/v1/health/ready` 不包含这个能力状态或任何图片平台配置。

后台图片平台支持按供应商配置可选余额查询路径及 JSON 字段，例如 `data.balance.remaining`。各 OpenAI 兼容平台没有统一的余额端点，须以对应供应商文档为准；解锁平台设置后会立即查询，并在后台页面可见时每 60 秒自动刷新，也可手动查询。余额不写入数据库，平台 API Key 不会返回浏览器。未配置路径的平台会显示“未配置余额接口”。此设置由数据库迁移 18 添加。

临时生成结果在 15 分钟后清理；服务关闭时也会停止清理定时器并再次清理已过期目录。MariaDB 备份与恢复脚本导出和校验完整数据库，因此迁移 14（`image_generation_providers`）与其他业务表一起受到备份和恢复保护。

#### 灾难恢复

MariaDB 备份只包含平台 API Key 的密文，不包含可用于解密的主密钥。将精确的 `NIKE_IMAGE_CONFIG_KEY` 与数据库备份分开安全托管，并在恢复数据库前将同一个值恢复到服务器环境或权限为 `600` 的密钥文件；更换为新值无法解密既有平台配置。若该密钥已丢失，恢复后必须在后台重新输入每个平台的 API Key，旧密文不能恢复。

## 未来扩展方向

1. 评估多实例需求后，再为会话、队列和媒体资源引入共享服务。
2. 只有确认 MariaDB 无法满足实际负载时，再评估 PostgreSQL 等替代数据库。
3. 周报已接入自动发送；后台授权细分和现有图片任务机制的多实例支持按真实需求逐步扩展。
