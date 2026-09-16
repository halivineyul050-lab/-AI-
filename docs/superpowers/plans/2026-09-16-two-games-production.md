# Two Games Production Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish “一人不撤2 · 残铁战线” and “一人不撤” as two new playable entries while retaining every existing game.

**Architecture:** Copy each self-contained build into a dedicated repository directory and expose it through a narrowly scoped `/games/<slug>/...` static route. Update the games index and sitemap, then deploy the tested repository snapshot with the existing production release script.

**Tech Stack:** Node.js 22 HTTP server, static HTML/CSS/JavaScript, WebGL/Three.js, Node test runner, nginx/systemd production host.

## Global Constraints

- Keep the existing “用不后退” game and all current routes.
- Publish `/games/ironfront` and `/games/yiren-buche` as separate games.
- Preserve each build's relative asset layout.
- Add a usable `/games` return control to each game.
- Do not add accounts, database storage, networking, or multiplayer.
- Do not modify the source folders on the desktop.

---

### Task 1: Define route and asset behavior with tests

**Files:**
- Create: `tests/production-games.test.mjs`
- Modify: `server.mjs`

**Interfaces:**
- Consumes: existing `serveStatic(request, response, pathname, staticDir)` request flow.
- Produces: GET/HEAD support for `/games/ironfront`, `/games/ironfront/*`, `/games/yiren-buche`, and `/games/yiren-buche/*` with safe path resolution and correct MIME types.

- [ ] **Step 1: Write failing route tests**

Create tests that start the application with the existing test harness and assert both index routes return `200`, a representative JavaScript/CSS/image resource returns `200` with its expected content type, `HEAD` returns no body, and encoded traversal attempts return `404`.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node --no-warnings --test --test-concurrency=1 tests/production-games.test.mjs`
Expected: FAIL because the two routes are not registered.

- [ ] **Step 3: Implement the scoped static-directory handler**

Add a route table mapping `ironfront` and `yiren-buche` to their repository directories. Normalize and decode the suffix, reject traversal and missing files, serve `index.html` for each route root, and reuse the server's cache and security headers.

- [ ] **Step 4: Run the focused test**

Run: `node --no-warnings --test --test-concurrency=1 tests/production-games.test.mjs`
Expected: PASS.

### Task 2: Import and integrate the two game builds

**Files:**
- Create: `games/ironfront/**`
- Create: `games/yiren-buche/**`
- Modify: `games/ironfront/index.html`
- Modify: `games/yiren-buche/index.html`
- Modify: `games.html`
- Modify: `games.css`
- Modify: `server.mjs`
- Test: `tests/production-games.test.mjs`

**Interfaces:**
- Consumes: the two source build directories named in the approved design.
- Produces: two isolated playable builds, two cards on `/games`, and sitemap entries for both routes.

- [ ] **Step 1: Copy exact build files into isolated directories**

Use `Copy-Item -Recurse` from each desktop source folder to its matching `games/<slug>` destination, without writing back to the source folders.

- [ ] **Step 2: Add return controls**

Add an accessible fixed `<a href="/games">返回小游戏</a>` control to both index documents and scoped styles that remain visible above the WebGL canvas and respect mobile safe areas.

- [ ] **Step 3: Update the games index**

Change the count to `09 款小游戏`, extend the meta description, and add cards numbered 08 and 09 that link to the two new routes. Add two card-art variants in `games.css` using the current visual system.

- [ ] **Step 4: Add sitemap paths**

Add `/games/ironfront` and `/games/yiren-buche` to the existing monthly game path list.

- [ ] **Step 5: Expand integration assertions**

Assert the games index contains nine cards, both new links and names, each game index has the return control, and every relative `src`/`href` resource referenced by both index files exists.

- [ ] **Step 6: Run focused tests**

Run: `node --no-warnings --test --test-concurrency=1 tests/production-games.test.mjs tests/utility-navigation.test.mjs`
Expected: PASS.

### Task 3: Browser and regression verification

**Files:**
- Modify only if verification exposes a defect in files from Tasks 1–2.

**Interfaces:**
- Consumes: local server routes from Tasks 1–2.
- Produces: verified desktop/mobile entry flow and regression evidence.

- [ ] **Step 1: Start the application locally**

Run: `node --env-file-if-exists=.env --no-warnings server.mjs` and record the bound port.

- [ ] **Step 2: Exercise the pages in a browser**

Open `/games`, `/games/ironfront`, and `/games/yiren-buche`; confirm page rendering, no failed local resources, each game reaches its start menu, and the return control navigates to `/games`. Repeat at a mobile viewport.

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 4: Commit the implementation**

Stage only the imported game directories, integration files, and test file. Commit with `feat: publish two survival games`.

### Task 4: Production release and online verification

**Files:**
- Use: `scripts/release-production.sh`
- Use: `tmp/video-limits-release/publish.py`

**Interfaces:**
- Consumes: committed and verified repository snapshot.
- Produces: live routes on `https://ontimo.cn` with rollback artifacts created by the existing release script.

- [ ] **Step 1: Build a release archive**

Create an archive from the verified repository state while excluding `.git`, local environment files, untracked reports, `output`, and unrelated `tmp` content.

- [ ] **Step 2: Upload and run the existing release script**

Upload the archive through the established SSH helper, run the production release workflow, and verify `nikai-ai.service` and nginx remain healthy.

- [ ] **Step 3: Verify live routes**

Request `/games`, both game roots, and representative assets over HTTPS. Confirm `200` responses, correct content types, both game cards, return controls, and no missing startup resources.

- [ ] **Step 4: Record release evidence**

Capture the deployed commit, service status, live HTTP checks, and any browser-console limitations in the completion report.
