# Tank Air War Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish Tank Air War as the tenth game at `/games/tank-air-war` with safe local assets, a hall card, return navigation, sitemap discovery, and production verification.

**Architecture:** Copy the supplied standalone game into `games/tank-air-war` and extend the existing isolated production-game file server to recognize the new slug. Preserve all game-relative assets and behavior; only add a scoped return link and the site-level discovery metadata.

**Tech Stack:** Static HTML/CSS/JavaScript, Three.js vendored by the game, Node.js 22 HTTP server and test runner, existing SSH production release script.

## Global Constraints

- Source is `D:/Desktop/小游戏/tank-air-war-v1/`; omit `play.bat`.
- Public route is `/games/tank-air-war` and all assets stay below that prefix.
- Preserve gameplay logic, settings, records, controls, and local-storage keys.
- Add one `/games` return link that remains usable on narrow screens.
- Update the hall count to 10 and add exactly one game card.
- Reject decoded traversal, backslash, NUL, empty, dot, and dot-dot asset segments.
- Do not touch unrelated untracked workspace files.

---

### Task 1: Define and Implement the Safe Game Route

**Files:**
- Modify: `tests/production-games.test.mjs`
- Modify: `server.mjs`
- Create: `games/tank-air-war/index.html`
- Create: `games/tank-air-war/style.css`
- Create: `games/tank-air-war/favicon.svg`
- Create: `games/tank-air-war/js/*.js`

**Interfaces:**
- Produces `/games/tank-air-war` and `/games/tank-air-war/<relative asset>`.
- Extends `serveProductionGame()` slug matching without changing its validation contract.

- [ ] Write failing route, dependency, MIME and traversal tests for Tank Air War.
- [ ] Run `node --test tests/production-games.test.mjs` and confirm failure on the new route.
- [ ] Copy the supplied web assets except `play.bat`; extend the route slug matcher and sitemap list.
- [ ] Add `<a class="site-return" href="/games">返回休闲小游戏</a>` and scoped responsive styling.
- [ ] Run the focused test and confirm every referenced dependency returns 200.
- [ ] Commit with `feat: add tank air war game route`.

### Task 2: Add the Tenth Hall Card

**Files:**
- Modify: `tests/production-games.test.mjs`
- Modify: `tests/api.test.mjs`
- Modify: `games.html`
- Modify: `games.css`

**Interfaces:**
- Produces one hall link to `/games/tank-air-war` and `.tank-air-war` card artwork.

- [ ] Write failing assertions for 10 cards, the 10-game counter, title, link, and card art class.
- [ ] Run the two focused test files and confirm the expected failures.
- [ ] Add the compact card, page description/count update, and CSS-only tank/radar artwork.
- [ ] Run the focused tests and confirm pass.
- [ ] Commit with `feat: feature tank air war in games hall`.

### Task 3: Browser QA, Full Verification, and Production Release

**Files:**
- Modify as needed: files from Tasks 1–2
- Create: `docs/deployment-tank-air-war-20260920.md`

**Interfaces:**
- Publishes the verified files to `https://ontimo.cn/games/tank-air-war`.

- [ ] Run `npm test` and require zero failures.
- [ ] Serve locally and verify menu, settings/help/records, start-game action, return link, console, and 390px overflow.
- [ ] Fix observed defects with a failing regression test first, then rerun focused and full tests.
- [ ] Package only required tracked files and deploy through `/opt/nikai-ai/scripts/release-production.sh` after its snapshot step.
- [ ] Verify production tests, service/Nginx status, health endpoint, root page, representative assets, hall, sitemap, and SHA-256 manifest.
- [ ] Record version, snapshot, test totals, checks and rollback path; commit with `docs: record tank air war deployment`.
