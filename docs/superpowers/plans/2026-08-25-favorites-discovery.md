# Discoverable Favorites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give anonymous users an obvious, stable `/favorites` view with clear desktop/mobile entry points, actionable save feedback, empty state, and safe clearing.

**Architecture:** Keep `state.favorites` and `nike-favorites` as the sole persistence mechanism. Reuse the existing tools view and result loader, adding a thin favorites presentation layer and routing `/favorites` to `view: "tools"` with `favoritesOnly: true`; no backend, schema, or account changes.

**Tech Stack:** Native HTML/CSS/JavaScript, browser `localStorage`, Node.js built-in test runner, existing Node.js/SQLite application.

## Global Constraints

- Do not restore login, registration, or account center navigation.
- Do not modify backend favorites APIs or database schema.
- Preserve legacy `/?favorites=1` links and normalize them to `/favorites`.
- Preserve existing search, category, filter, compare, drawer, and official-link behavior.
- Keep changes surgical in `index.html`, `styles.css`, `app.js`, and focused tests.

---

### Task 1: Lock the Favorites Contract with Failing Tests

**Files:**
- Create: `tests/favorites-ui.test.mjs`
- Read: `index.html`
- Read: `app.js`

**Interfaces:**
- Consumes: current DOM IDs `favorite-toggle`, `favorite-count`, `tool-grid`, and state property `favoritesOnly`.
- Produces: regression assertions for `/favorites`, labeled entry points, local-browser notice, clear action, and legacy URL normalization.

- [ ] **Step 1: Write the static regression test**

Create a Node test that reads `index.html` and `app.js` and asserts all of the following literal contracts:

```js
assert.match(html, /id="favorite-toggle"[\s\S]*我的收藏/);
assert.match(html, /id="mobile-favorites-open"/);
assert.match(html, /id="favorites-view-heading"/);
assert.match(html, /id="favorites-clear"/);
assert.match(html, /收藏仅保存在当前浏览器/);
assert.match(app, /location\.pathname === "\/favorites"/);
assert.match(app, /history\.replaceState\(null, "", "\/favorites/);
assert.match(app, /favorites_view/);
assert.match(app, /favorites_clear/);
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node --test tests/favorites-ui.test.mjs`

Expected: FAIL because the labeled entry points, view heading, route, and events do not exist.

- [ ] **Step 3: Commit the failing contract test**

```bash
git add tests/favorites-ui.test.mjs
git commit -m "test: define discoverable favorites contract"
```

---

### Task 2: Add the Favorites Presentation and Responsive Entry Points

**Files:**
- Modify: `index.html:67-76`
- Modify: `index.html` inside the mobile `.primary-nav`
- Modify: `index.html` at the top of `#tools-view`
- Modify: `styles.css:467-472`
- Modify: `styles.css:815-828`
- Modify: `styles.css` responsive sections around 4436 and 4679
- Test: `tests/favorites-ui.test.mjs`

**Interfaces:**
- Consumes: `favorite-count`, existing `.topbar-actions`, `.primary-nav`, and tools view.
- Produces: `#mobile-favorites-open`, `#mobile-favorite-count`, `#favorites-view-heading`, `#favorites-browser-note`, `#favorites-back`, and `#favorites-clear`.

- [ ] **Step 1: Change the desktop entry to labeled markup**

Use this structure while preserving the existing count ID:

```html
<button class="icon-button action-with-count favorites-entry" id="favorite-toggle" type="button" aria-label="我的收藏" aria-pressed="false" title="我的收藏">
  <i data-lucide="bookmark"></i><span class="favorites-entry-label">我的收藏</span><span id="favorite-count">0</span>
</button>
```

- [ ] **Step 2: Add a labeled mobile navigation action**

Add a `.nav-item` button with `id="mobile-favorites-open"`, bookmark icon, text “我的收藏”, and `id="mobile-favorite-count"`.

- [ ] **Step 3: Add the favorites context bar to the tools view**

Add a container hidden by default with title, count copy, local-browser notice, “返回工具库”, and “清空收藏” buttons using the IDs in the Interfaces block.

- [ ] **Step 4: Style the context bar and responsive entries**

Keep the desktop label visible above 720px, hide only `.favorites-entry-label` on smaller screens, keep count visible, and style the context bar with existing surface, border, typography, and button tokens.

- [ ] **Step 5: Run the focused test**

Run: `node --test tests/favorites-ui.test.mjs`

Expected: still FAIL only on routing/events not yet implemented; all HTML assertions pass.

- [ ] **Step 6: Commit the presentation**

```bash
git add index.html styles.css tests/favorites-ui.test.mjs
git commit -m "feat: add visible favorites entry points"
```

---

### Task 3: Implement Stable Routing, View State, and Actions

**Files:**
- Modify: `app.js:2212-2295`
- Modify: `app.js:1744-1755`
- Modify: `app.js:1828-1845`
- Modify: `app.js:1871-1886`
- Modify: `app.js:2426-2532`
- Test: `tests/favorites-ui.test.mjs`

**Interfaces:**
- Consumes: `state.favorites`, `state.favoritesOnly`, `refreshToolResults()`, `saveLocalArray()`, `showToast()`, `track()`, and existing tools rendering.
- Produces: `openFavoritesView(source)`, `leaveFavoritesView()`, `clearFavorites()`, and `/favorites` URL behavior.

- [ ] **Step 1: Recognize `/favorites` during route resolution**

Before category matching, return `{ view: "tools", favoritesOnly: true, targetId: "" }` when `location.pathname === "/favorites"`.

- [ ] **Step 2: Load and normalize favorites state**

Set `state.favoritesOnly` from `destination.favoritesOnly || params.get("favorites") === "1"`. When the legacy query flag is present, preserve active filters and call `history.replaceState` with `/favorites` plus non-favorites query parameters.

- [ ] **Step 3: Make URL synchronization route-aware**

In both active-view navigation and filter URL replacement, choose `/favorites` whenever `state.favoritesOnly` is true. Remove the obsolete `favorites=1` query emission.

- [ ] **Step 4: Render favorites context consistently**

Add a small function that:

- shows the context bar only when `favoritesOnly` is true;
- updates both desktop and mobile counts;
- updates heading copy with the count;
- hides clear when count is zero;
- sets `aria-current="page"` and `aria-pressed` on the desktop entry;
- emits `favorites_view` once per entry to the view.

- [ ] **Step 5: Add explicit navigation helpers**

`openFavoritesView(source)` sets `favoritesOnly = true`, activates tools without losing the mode, refreshes results, updates `/favorites`, closes mobile navigation, and records the source. `leaveFavoritesView()` clears the mode and returns to `/`.

- [ ] **Step 6: Add clear behavior**

`clearFavorites()` calls `window.confirm("确定清空当前浏览器中的全部收藏吗？")`; on confirmation it clears the Set, saves the empty array, refreshes, records `favorites_clear`, and leaves the user on `/favorites` in the empty state.

- [ ] **Step 7: Make the save Toast actionable**

Extend `showToast` minimally to accept an optional action label/callback, or add a focused wrapper. On add, display “已收藏 {name}” with “查看收藏”; on remove, keep the existing text-only Toast.

- [ ] **Step 8: Bind desktop, mobile, back, and clear events**

Replace the desktop toggle semantics with direct favorites navigation. Bind the mobile entry, back button, and clear button to the helpers above.

- [ ] **Step 9: Run focused and full tests**

Run:

```powershell
node --test tests/favorites-ui.test.mjs
npm test
```

Expected: focused test passes; full suite reports zero failures.

- [ ] **Step 10: Commit behavior**

```bash
git add app.js tests/favorites-ui.test.mjs
git commit -m "feat: add stable local favorites view"
```

---

### Task 4: Browser Verification and Production Release

**Files:**
- Modify only if verification exposes a defect in the preceding files.
- Read: `scripts/release-production.sh`
- Read: `scripts/rollback-production.sh`
- Read: `上线前检查清单.md`

**Interfaces:**
- Consumes: completed `/favorites` implementation and repository release workflow.
- Produces: verified local behavior, release archive, production health confirmation, and rollback evidence if deployment fails.

- [ ] **Step 1: Start the full local service**

Run: `npm start`

Expected: service listens on `http://127.0.0.1:4173/` with the existing database.

- [ ] **Step 2: Verify desktop workflow in a real browser**

Check: save a tool → count updates → Toast action opens `/favorites` → refresh persists → remove last item shows empty state → back returns to the full library.

- [ ] **Step 3: Verify mobile workflow at 390px width**

Check: mobile menu has labeled “我的收藏”, count is visible, entry opens `/favorites`, and buttons remain usable without horizontal overflow.

- [ ] **Step 4: Verify legacy and direct URLs**

Open `/?favorites=1` and confirm normalization; open `/favorites` directly and confirm HTTP 200 plus client initialization.

- [ ] **Step 5: Run release gates**

Run:

```powershell
npm test
npm run logos:verify
node --check server.mjs
```

Expected: every command exits 0.

- [ ] **Step 6: Inspect production release authority and target**

Confirm the current environment has the documented production host access and exact archive handoff mechanism. Do not infer credentials or destination beyond the existing repository workflow.

- [ ] **Step 7: Create and deploy the release using the existing script**

Package tracked application files excluding `.git`, `.env`, `data`, `node_modules`, imports, reports, and temporary artifacts. Transfer the archive through the already-configured production path, then run:

```bash
sudo /opt/nikai-ai/scripts/release-production.sh /path/to/release.tgz favorites-view-20260825
```

Expected: script backs up the database and application, runs `node --check server.mjs` and `npm test`, restarts `nikai-ai.service`, then reports `Release completed` only after `/api/v1/health/ready` succeeds.

- [ ] **Step 8: Verify production behavior**

Check `https://ontimo.cn/api/v1/health/live`, `/health/ready`, `/favorites`, then repeat the save/view/refresh flow on the public site.

- [ ] **Step 9: Commit any verification-only correction**

If browser verification required a correction, add only the affected implementation/test files and commit with a specific fix message. If no correction was needed, create no extra commit.
