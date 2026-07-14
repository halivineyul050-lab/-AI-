---
title: 泥壳AI工具站后端地址与接口说明
aliases:
  - 泥壳AI后端
  - 泥壳AI接口地址
tags:
  - 泥壳AI工具站
  - 后端
  - API
  - SQLite
status: 已实现
created: 2026-07-13
updated: 2026-07-13
---

# 泥壳AI工具站后端地址与接口说明

> [!summary] 核心信息
> - 前端和后端采用**同源部署**，共同使用 `4173` 端口，并没有单独的 `3001` 后端端口。
> - 网站地址：<http://127.0.0.1:4173/>
> - 实时监控后台：<http://127.0.0.1:4173/admin.html>
> - API 根地址：`http://127.0.0.1:4173/api/v1`
> - 当前健康检查返回 `200`，数据库连接正常。

## 一、访问地址

| 类型 | 地址 | 说明 |
|---|---|---|
| 网站首页 | <http://127.0.0.1:4173/> | 用户端完整页面 |
| 实时监控后台 | <http://127.0.0.1:4173/admin.html> | 聚合监控、系统健康和投稿审核 |
| API 根地址 | `http://127.0.0.1:4173/api/v1` | 所有公开 API 的统一前缀 |
| 就绪检查 | <http://127.0.0.1:4173/api/v1/health/ready> | 检查服务和数据库是否可用 |
| 存活检查 | <http://127.0.0.1:4173/api/v1/health/live> | 检查 Node.js 服务进程是否存活 |
| 页面初始化数据 | <http://127.0.0.1:4173/api/v1/site/bootstrap> | 返回分类计数、文章、专题和推广工具 |
| 工具列表 | <http://127.0.0.1:4173/api/v1/tools> | 工具搜索、筛选、排序和分页 |
| 文章列表 | <http://127.0.0.1:4173/api/v1/articles> | 教程和资讯内容 |
| 管理接口根地址 | `http://127.0.0.1:4173/api/admin/v1` | 本机可匿名读取脱敏监控；管理操作需要令牌 |

## 二、公开接口

### 1. 健康检查

```http
GET /api/v1/health/live
GET /api/v1/health/ready
```

`live` 只检查服务进程，`ready` 同时检查 SQLite 数据库。

### 2. 初始化数据

```http
GET /api/v1/site/bootstrap
```

一次返回前端初始化所需的：

- 工具分类及全站分类计数
- 教程
- AI资讯
- 精选专题
- 单个推广工具

普通工具不再随初始化接口全量返回。前端首屏通过工具列表接口获取24条，后续按 `limit` / `offset` 加载更多；搜索和筛选也始终由该接口在服务端执行。

### 3. 工具列表与搜索

```http
GET /api/v1/tools
```

支持参数：

| 参数 | 示例 | 作用 |
|---|---|---|
| `q` | `代码` | 搜索名称、简介和描述 |
| `category` | `coding` | 按分类筛选 |
| `price` | `free` | 按价格类型筛选 |
| `platform` | `desktop` | 按平台筛选 |
| `language` / `lang` | `multi` | 按语言筛选 |
| `sort` | `popular` | 排序方式 |
| `limit` | `24` | 返回数量，最高500条 |
| `offset` | `0` | 分页偏移量 |

示例：

```text
http://127.0.0.1:4173/api/v1/tools?category=coding&platform=desktop&sort=newest
```

### 4. 工具详情

```http
GET /api/v1/tools/:idOrSlug
```

示例：

```text
http://127.0.0.1:4173/api/v1/tools/doubao
```

### 5. 教程和资讯

```http
GET /api/v1/articles
GET /api/v1/articles?kind=tutorial
GET /api/v1/articles?kind=news
GET /api/v1/articles/:idOrSlug
```

### 6. 提交工具

```http
POST /api/v1/tool-submissions
```

提交后会返回：

- `id`
- `trackingCode`
- `lookupToken`
- `status: pending`

查询审核状态：

```http
GET /api/v1/tool-submissions/:trackingCode/status?token=:lookupToken
```

### 7. 周报订阅

```http
POST /api/v1/newsletter/subscriptions
DELETE /api/v1/newsletter/subscriptions/:unsubscribeToken
```

当前版本会真实保存订阅记录并支持退订，但尚未接入邮件发送服务和双重确认邮件。

### 8. 数据埋点

```http
POST /api/v1/events/batch
```

用于上报：

- 页面访问
- 搜索
- 分类点击
- 工具卡片点击
- 工具详情访问
- 官网跳转
- 文章点击
- 广告曝光与点击

事件通过 `eventId` 去重，单批最多50条，原始数据默认保留90天。

### 9. 官网跳转

```http
GET /r/tools/:toolId?placement=detail_drawer
```

服务端会：

1. 根据工具 ID 从数据库读取已审核官网地址。
2. 记录跳转来源和 Session。
3. 过滤常见爬虫与预加载请求。
4. 返回 `302` 跳转到工具官网。

该接口不接受任意目标 URL，因此不会成为开放重定向器。

## 三、管理接口

管理接口统一前缀：

```text
http://127.0.0.1:4173/api/admin/v1
```

已实现：

```http
GET   /api/admin/v1/monitoring?hours=24
GET   /api/admin/v1/summary
GET   /api/admin/v1/submissions?status=pending
PATCH /api/admin/v1/submissions/:id
```

本地 `.env` 已配置开发令牌；启动命令会自动读取。也可以通过进程环境变量覆盖：

```powershell
$env:NIKE_ADMIN_TOKEN = "替换为随机长令牌"
$env:NIKE_ANALYTICS_SALT = "替换为独立随机盐值"
npm start
```

请求管理接口时携带：

```http
Authorization: Bearer <NIKE_ADMIN_TOKEN>
```

> [!warning] 管理端边界
> 当前已提供可视化实时监控和投稿审核页面，但鉴权仍是本地原型的共享令牌，没有管理员账户、MFA 和 RBAC。生产模式不允许匿名监控，并默认关闭共享令牌管理接口。

监控后台每 5 秒更新，支持 24 小时/7 天窗口、暂停和手动刷新。匿名只读模式仅展示脱敏聚合数据；输入 `.env` 中的 `NIKE_ADMIN_TOKEN` 后才显示热门搜索、最近事件和投稿联系方式，并允许审核。

## 四、数据库

数据库文件：

```text
./data/nike-ai.db
```

当前数据：

| 数据 | 数量 |
|---|---:|
| 工具 | 28 |
| 分类 | 9 |
| 文章 | 12 |
| 专题 | 3 |

数据库已启用：

- SQLite WAL
- 外键约束
- 四个版本化迁移
- 投稿审核状态
- 管理操作审计日志
- 事件和跳转数据定期清理

## 五、启动与测试

项目目录：

```text
Git 仓库根目录
```

启动服务：

```powershell
npm start
```

开发监听：

```powershell
npm run dev
```

运行自动化测试：

```powershell
npm test
```

当前测试结果：`23/23` 通过。

## 六、代码位置

| 文件 | 作用 |
|---|---|
| [[README]] | 项目总说明 |
| [[backend/README]] | 后端接口和生产迁移说明 |
| `server.mjs` | HTTP服务、路由、安全和静态文件服务 |
| `backend/schema.sql` | 初始数据库结构 |
| `backend/migrations/` | 数据库增量迁移 |
| `backend/tool-import.mjs` | 授权工具目录规范化、去重和事务入库 |
| `scripts/import-tool-catalog.mjs` | CSV、JSON、NDJSON 本地导入命令 |
| `backend/database.mjs` | 数据访问和事务 |
| `backend/validation.mjs` | 输入校验和安全限制 |
| `backend/seed-data.json` | 初始内容种子 |
| `tests/api.test.mjs` | 后端集成测试 |
| `tests/monitoring.test.mjs` | 监控聚合与安全契约测试 |
| `admin.html` / `admin.css` / `admin.js` | 实时监控和投稿审核后台 |

## 七、当前定位与下一阶段

当前后端属于**可直接运行的 MVP 模块化单体**：

- 本地技术栈：Node.js 22 + SQLite
- 前后端同源部署
- 不依赖 Docker 或第三方 npm 包
- 已覆盖网站核心读写与数据统计链路

正式公网部署建议升级为：

```text
前端：Next.js / Nuxt SSR
后端：NestJS模块化单体
数据库：PostgreSQL
缓存与队列：Redis + BullMQ
搜索：PostgreSQL pg_trgm / FTS
素材：S3兼容对象存储 + CDN
管理端：独立管理后台 + 账户体系 + MFA + RBAC
```

---

最后核对日期：2026-07-13
当前后端地址：`http://127.0.0.1:4173/api/v1`
