# AI Image Placeholder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在全站导航增加“AI 生图”，并发布一个为未来 GPT 图片生成 API 预留的静态占位页。

**Architecture:** 新增独立 `image-generation.html` 与 `image-generation.css`，由现有静态文件服务映射 `/image-generation`。批量更新所有带主导航的 HTML，并通过测试锁定路由、导航顺序、无 API 表单和 sitemap。

**Tech Stack:** HTML5, CSS, Node.js static server, Node test runner

## Global Constraints

- 导航名称为“AI 生图”，地址为 `/image-generation`。
- 入口位于“视频模型价格”之后或“资讯”之后，并在“小工具”之前。
- 本次不增加 API 调用、文件上传、提示词输入或生成按钮。
- 页面遵循现有紫色大卡片设计并兼容移动端与暗色主题。

---

### Task 1: Define route and navigation behavior with tests

**Files:**
- Create: `tests/image-generation-placeholder.test.mjs`
- Modify: `tests/design-system.test.mjs`

**Interfaces:**
- Consumes: `buildApplication()` and existing static page headers.
- Produces: assertions for `/image-generation`, one nav entry per page, nav order, placeholder-only content, and sitemap inclusion.

- [ ] **Step 1: Write the failing integration test**

Test HTTP 200, active navigation, page copy, absence of upload/API form controls, and sitemap URL. Read every HTML file containing `site-nav` and assert exactly one `/image-generation` link before `/utilities`.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `node --test tests/image-generation-placeholder.test.mjs tests/design-system.test.mjs`

Expected: FAIL because the route, page, navigation links, and sitemap entry do not exist.

### Task 2: Build the placeholder and route

**Files:**
- Create: `image-generation.html`
- Create: `image-generation.css`
- Modify: `server.mjs`
- Modify: `sitemap.xml`
- Modify: all root HTML files containing `<nav class="site-nav"`.

**Interfaces:**
- Consumes: shared `design-system.css`, `styles.css`, `utility-theme.css`, and `utility-theme.js`.
- Produces: public `/image-generation` page and a consistent navigation entry.

- [ ] **Step 1: Create semantic placeholder markup**

Add the shared header, active navigation link, hero, three future-capability cards, availability note, and links to `/` and `/utilities`.

- [ ] **Step 2: Add responsive purple-card styling**

Use project variables, desktop three-card layout, mobile single-column layout, focus-visible states, dark-theme variables, and reduced-motion support.

- [ ] **Step 3: Register static files and route**

Add both files to `staticFiles` and map `/image-generation` to `image-generation.html` in `utilityPages`.

- [ ] **Step 4: Update all static navigation headers and sitemap**

Insert exactly one link before `/utilities` in every page that contains `site-nav`; mark it active only on the new page. Add the canonical production URL to `sitemap.xml` and generated sitemap entries.

- [ ] **Step 5: Run the focused tests**

Run: `node --test tests/image-generation-placeholder.test.mjs tests/design-system.test.mjs`

Expected: all tests pass.

### Task 3: Browser verification and release

**Files:**
- Create: `docs/deployment-ai-image-placeholder-20260916.md`

**Interfaces:**
- Consumes: completed page, styles, route, navigation, tests, and sitemap.
- Produces: verified production page and rollback record.

- [ ] **Step 1: Inspect 1440px, 1024px, and 390px layouts**

Confirm no horizontal overflow, correct active navigation, readable cards, and no unusable controls.

- [ ] **Step 2: Run the full local suite and commit**

Run: `npm test`. Stage only intended files and commit.

- [ ] **Step 3: Release with the existing production script**

Upload a minimal archive and execute `/opt/nikai-ai/scripts/release-production.sh` with release ID `ai-image-placeholder-20260916`.

- [ ] **Step 4: Verify and document production**

Verify production tests, service health, HTTP 200, live copy, nav link, sitemap, and published hashes. Record the release and rollback snapshot, then commit the deployment record.
