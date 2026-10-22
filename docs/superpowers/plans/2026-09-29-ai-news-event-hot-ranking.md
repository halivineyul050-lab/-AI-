# AI 资讯事件聚合与热榜实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 将 RSS 新闻归并为可追溯的事件资讯，按近 48 小时的多站点信号排序，并在 `/news` 页面和只读 API 展示热点。

**Architecture:** 以现有 `articles` 记录作为事件锚点，新增来源关系表保存参与报道。自动采编用现有的一次结构化模型请求选择新事件或补充到近期文章；热度计算放在应用层，复用来源时间和规范化主机名，网站和 API 共用同一排序函数。

**Tech Stack:** Node.js ES modules、原生 HTTP 服务、SQLite、MariaDB 兼容层、原生 HTML/CSS/JavaScript、现有 Responses API 客户端。

## Global Constraints

- 继续使用现有 RSS 配置和采集周期，不新增 RSS 以外的采集器。
- 每轮至多将 6 条来源项和 10 篇近期文章摘要交给现有模型请求；不增加独立模型调用，不引入向量服务。
- RSS 标题和摘要是不可信材料；模型只能引用本轮允许的来源 ID 和服务器提供的近期文章 ID。
- 关联到已发布文章时只补充来源记录，不改标题、摘要、正文、状态或 CMS 修订号。
- 原文 URL 以 SHA-256 哈希幂等；主机名转小写并移除 `www.`，每事件相同主机只计一次。
- 热度窗口 48 小时、半衰期 24 小时、至少 2 个站点、最多 10 个热点；“升温”阈值为 6 小时对比上升超过 15%；“突增”需最近 6 小时新增至少 3 个站点且占窗口站点数至少一半。
- 旧文章只使用已知 `source_url` 作为单一回退来源，不推断未保存的引用。
- 当前工作区可见迁移版本为 18；实现前重新确认实际迁移头，再选择下一连续版本，SQLite 和 MariaDB 版本必须一致。
- 保持现有 API 字段兼容；公共热点 API 不把内部热度数值定义为稳定字段。
- 本轮执行约束：未获用户要求前，不新增或运行测试。

---

## 文件职责

| 路径 | 职责 |
|---|---|
| `backend/migrations/019_article_source_links.sql` | SQLite 来源关联表与索引 |
| `backend/mariadb/migrations/019_article_source_links.sql` | MariaDB 对应表与索引 |
| `backend/database.mjs` | SQLite 迁移注册、文章来源读取、近期事件锚点和热点数据装配 |
| `backend/mariadb-compat.mjs` | MariaDB 迁移注册和兼容 SQL 接入 |
| `backend/article-source-links.mjs` | 来源 URL 哈希、站点规范化、关系读写及旧字段回退 |
| `backend/content-admin.mjs` | 在文章创建/来源补充事务内保存来源关系 |
| `backend/news-publisher.mjs` | 传入近期事件锚点、校验模型选择、创建或补充事件来源 |
| `backend/news-hot-ranking.mjs` | 纯应用层热度、趋势与标记计算 |
| `server.mjs` | 热点 API 路由、参数校验和现有文章详情扩展 |
| `public/index.html` | 新闻页热点区结构 |
| `public/app.js` | 拉取并渲染热点、详情来源列表 |
| `public/styles.css` | 热点卡片、来源列表和窄屏布局 |
| `README.md`、`backend/README.md` | 公共热点接口说明 |

开始修改现有文件前，先查看这些文件当前的工作区差异；保留已有改动，只做所需的局部编辑。

## Task 1: 增加来源关系存储

**Files:**
- Create: `backend/migrations/019_article_source_links.sql`
- Create: `backend/mariadb/migrations/019_article_source_links.sql`
- Create: `backend/article-source-links.mjs`
- Modify: `backend/database.mjs`
- Modify: `backend/mariadb-compat.mjs`

**Interfaces:**
- `sourceUrlHash(sourceUrl)` returns a 64-character lowercase SHA-256 hex string.
- `normalizeNewsSourceHost(sourceUrl)` parses only `http`/`https` URLs, lowercases the hostname and strips a leading `www.`; invalid URLs return `null`.
- `insertArticleSourceLinks(db, articleId, sourceItems, discoveredAt)` inserts the selected candidate metadata with `INSERT OR IGNORE`; it expects its caller to own the transaction.
- `listArticleSourceLinks(db, articleId, legacyArticle?)` returns `{ sourceUrl, sourceName, sourceTitle, sourcePublishedAt, discoveredAt, feedUrl }[]`, merging a legacy `articles.source_url` as one fallback when no relation row represents it.

- [x] **Step 1: Add the SQLite relation migration.** Create `article_source_links` with `source_url_hash TEXT PRIMARY KEY`, `article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE`, URL/name/feed/title fields, nullable `source_published_at`, and required `discovered_at`/`created_at`. Add indexes on `article_id`, `source_published_at`, and `discovered_at`.
- [x] **Step 2: Add the MariaDB relation migration.** Use a `CHAR(64)` primary key for the hash, text columns for URLs and titles, a foreign key to `articles(id)`, and matching indexes. Keep nullable timestamp semantics and the same column names as SQLite.
- [x] **Step 3: Register the next migration version in both runners.** Inspect current migration arrays first. Use the same next version and migration name in `database.mjs` and `mariadb-compat.mjs`; do not modify existing migration files.
- [x] **Step 4: Implement URL and host helpers.** Hash the exact accepted original URL; reject any scheme other than HTTP or HTTPS before persistence. Keep the original URL for attribution and display.
- [x] **Step 5: Implement idempotent relation writes and legacy reads.** Store one row per URL hash. For a legacy article with an unrepresented `source_url`, return one in-memory fallback record and derive its display name from `source_name` or hostname. Do not manufacture other sources.
- [x] **Step 6: Expose bounded database read helpers.** Add a helper that returns up to 10 published news anchors from the last 48 hours with their title, excerpt, ID, and latest known evidence time; add a helper that gathers recent source evidence for hot ranking.

## Task 2: Make the publisher select or extend one event

**Files:**
- Modify: `backend/news-publisher.mjs`
- Modify: `backend/content-admin.mjs`
- Use: `backend/article-source-links.mjs`

**Interfaces:**
- Candidate ID is `sourceUrlHash(item.link)`; model output cannot introduce a new URL.
- Structured editorial output has required keys `action`, `targetArticleId`, `sourceIds`, and `article`:

```json
{
  "action": "publish_new",
  "targetArticleId": null,
  "sourceIds": ["0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"],
  "article": {
    "topic": "AI 行业",
    "title": "标题",
    "excerpt": "摘要",
    "body": "正文",
    "readTime": "3分钟"
  }
}
```

- For `attach_sources`, `targetArticleId` must be one of the supplied recent anchors and `article` must be `null`.
- Extend `createAdminContent(db, type, body, context, { articleSourceItems })` so news creation and source insertion share its existing transaction. Add `attachArticleSources(db, articleId, sourceItems)` that verifies the target is still a published news article and commits only source links.

- [x] **Step 1: Give candidate items stable IDs.** In `runNewsPublisherOnce`, retain the existing feed and item caps, annotate each unseen item with its URL hash, and exclude any item already represented by a relation row or legacy `articles.source_url`.
- [x] **Step 2: Load recent event anchors.** Pass at most 10 recent published news articles as `{ id, title, excerpt, latestSourceAt }`; do not pass their full body.
- [x] **Step 3: Update the structured prompt and schema.** Ask the existing generation request to select one event, return only related candidate IDs, and choose `publish_new` or `attach_sources`. Explicitly treat source text as untrusted and tell the model to choose a new event when the match is uncertain.
- [x] **Step 4: Validate the response before writes.** Require a nonempty `sourceIds` array; require every ID to match an input item; for attachment, require a target ID from the anchor set and recheck that it is still published news. On invalid output, skip the run and log a concise reason; do not publish a partially validated article.
- [x] **Step 5: Add source writes to the content transaction.** Pass selected sources to article creation so article plus links commit atomically. For attachment, insert source links transactionally without changing article fields, status, audit revision, or CMS-managed content.
- [x] **Step 6: Preserve dry-run and scheduler behavior.** Dry-run returns the selected action, target, article draft when applicable, and selected source count without database writes. Scheduler interval, enable flag, logging lifecycle, and Responses API compatibility fallback remain intact.

## Task 3: Calculate hot ranking and expose it through the API

**Files:**
- Create: `backend/news-hot-ranking.mjs`
- Modify: `backend/database.mjs`
- Modify: `server.mjs`

**Interfaces:**
- `calculateNewsHotRanking(articles, now, limit = 10)` returns at most 10 entries with `rank`, article summary fields, `sourceCount`, `sourceNames`, `latestSourceAt`, and `badges`.
- `GET /api/v1/news/hot?limit=10` returns `{ windowHours: 48, halfLifeHours: 24, generatedAt, items }` and omits the raw heat score.
- The article detail API adds `sources` while retaining `source` and `sourceUrl`.

- [x] **Step 1: Implement a pure ranking function.** For each article, group source evidence by normalized host, select the latest evidence per host in the 48-hour window, and sum `2 ** (-ageHours / 24)`.
- [x] **Step 2: Implement trend badges using the specification's fixed windows.** Calculate the comparable score as of six hours earlier from evidence available then; mark `new` when the first event evidence is within six hours, `rising` when comparable heat rises by more than 15%, and `surge` when at least three newly observed hosts comprise at least half of the current hosts.
- [x] **Step 3: Sort and cap consistently.** Exclude events with fewer than two distinct hosts. Sort by heat descending, then latest evidence descending, then article ID ascending as a deterministic final tie-breaker. Apply `limit` after sorting.
- [x] **Step 4: Build the shared database result.** Query published news and recent source rows, add legacy singular source fallbacks, and call the pure function. Keep the query bounded to recent evidence and the latest article fields needed by cards.
- [x] **Step 5: Add the public route.** Place `GET /api/v1/news/hot` before conflicting parameter routes, apply the existing read rate limit, default `limit` to 10, reject non-integer or out-of-range values, and return the shared ranking result.
- [x] **Step 6: Extend the article detail response.** Include the normalized source list in `GET /api/v1/articles/:idOrSlug`; preserve existing list and detail fields so current clients continue to work.

## Task 4: Add the news page experience and API documentation

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`
- Modify: `public/styles.css`
- Modify: `README.md`
- Modify: `backend/README.md`

**Interfaces:**
- The news page fetches `GET /api/v1/news/hot?limit=10` and renders the returned ordering and badges without recalculating heat in the browser.
- Opening a hot or ordinary article requests its existing detail endpoint to obtain `sources`; if that request fails, render the cached article and singular primary source.

- [x] **Step 1: Add accessible hot-section markup.** Place a heading, explanatory 48-hour label, live result container, and empty-state container above `news-list`; retain the existing news sidebar and list IDs.
- [x] **Step 2: Fetch and render hot items.** Follow the app's current `apiRequest` and `escapeHTML` patterns. Render rank, title, host count, latest source time, and badges; bind each entry to the existing article drawer.
- [x] **Step 3: Render article source links.** Load article detail when the drawer opens; validate protocol and escape URL/title/name before rendering each link with `target="_blank"` and `rel="noopener noreferrer nofollow"`. Keep the old `sourceUrl` fallback.
- [x] **Step 4: Add responsive styles.** Match the existing news card palette, spacing, typography, focus states, and narrow-screen layout; keep the hot section compact above the list.
- [x] **Step 5: Document the API.** Add the endpoint, `limit` contract, response field meanings, and 48-hour ranking window to both API documentation locations without changing unrelated README content.

## Task 5: Review the integrated change against the approved specification

**Files:**
- Review: all files listed in Tasks 1–4
- Review: `docs/superpowers/specs/2026-09-29-ai-news-event-hot-ranking-design.md`

- [x] **Step 1: Reconcile each completion criterion.** Confirm source links persist and deduplicate, detail views show all known sources, API and page share the same ranked list, single-host events do not enter the hot list, old articles use only their known primary source, and attaching a source does not mutate CMS content.
- [x] **Step 2: Review both migration paths.** Confirm migration registration order, matching field names, foreign-key behavior, hash key length, and indexes in SQLite and MariaDB; recheck the actual version head before choosing the migration number.
- [x] **Step 3: Review compatibility and failure behavior.** Confirm invalid model IDs cannot produce writes, attachment targets are revalidated at write time, source links are stored atomically with new articles, API legacy fields remain present, and page rendering falls back to cached content.
- [x] **Step 4: Inspect the final diff.** Confirm only feature-related hunks were added to files with existing user modifications and that no unrelated workspace changes were staged or overwritten.

## Plan self-review

- Spec goals 1–2 map to Tasks 1–2; hot calculation and API map to Task 3; page/detail source display map to Task 4; CMS preservation and cross-database compatibility map to Tasks 1, 2, and 5.
- The 48-hour/24-hour formula, 6-hour badges, host normalization, minimum source count, output cap, prompt boundary, URL allowlist, and legacy fallback are defined in this plan and the approved specification.
- The plan adds no dedicated test files. After the user asked to proceed, the affected existing fixtures and migration-version assertions were updated, then the project suite passed with 324 tests and 2 skipped.
