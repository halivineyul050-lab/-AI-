# Unified Purple Card System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify every public, account, admin, utility, game, and pricing surface under one responsive purple card design system with complete light and dark themes.

**Architecture:** Add `design-system.css` as the sole source for semantic color, spacing, radius, shadow, typography, focus, button, input, card, table, modal, and shared site-shell rules. Existing page CSS files consume these variables and retain only layout or feature-specific presentation. A small static contract test verifies every HTML entry loads the shared layer and does not reintroduce conflicting root palettes.

**Tech Stack:** Native HTML, CSS, JavaScript, Node.js 22 test runner, existing Lucide icons; no new package or remote font dependency.

## Global Constraints

- Light page/card colors: `#F6F5FB` and `#FFFFFF`; dark page/card colors: `#11101A` and `#1B1927`.
- Light/dark brand colors: `#6558F5` and `#9388FF`.
- Keep current routes, element IDs, script selectors, form fields, data structures, and feature behavior.
- Preserve game-specific canvas and status accent colors while unifying each game's surrounding shell.
- Support desktop, tablet, and 375px mobile layouts without page-level horizontal overflow.
- Preserve light, dark, and system theme preferences and respect `prefers-reduced-motion`.
- Do not add CSS frameworks, runtime libraries, or remote fonts.

---

### Task 1: Shared semantic design system

**Files:**
- Create: `design-system.css`
- Create: `tests/design-system.test.mjs`
- Modify: `server.mjs` static file allowlist

**Interfaces:**
- Produces CSS custom properties `--bg-page`, `--bg-surface`, `--bg-subtle`, `--text-primary`, `--text-secondary`, `--text-muted`, `--border`, `--border-strong`, `--brand`, `--brand-hover`, `--brand-soft`, `--radius-sm`, `--radius-md`, `--radius-lg`, `--shadow-xs`, `--shadow-sm`, `--shadow-md`, `--shadow-lg`, plus shared `.site-header`, `.site-nav`, `.nav-item`, `.card`, `.button`, form, table, dialog, focus, and reduced-motion rules.
- Consumers load `/design-system.css` before their page-specific stylesheet.

- [ ] **Step 1: Write a failing static contract test**

Create `tests/design-system.test.mjs` that enumerates every root HTML file, asserts the shared stylesheet is linked, asserts `server.mjs` serves it, and verifies the shared file contains both light and dark token values plus reduced-motion and focus-visible rules.

- [ ] **Step 2: Run the contract test and confirm it fails**

Run: `node --test tests/design-system.test.mjs`
Expected: FAIL because `design-system.css` and page links do not exist.

- [ ] **Step 3: Implement the shared layer**

Create the semantic token blocks for `:root`, `[data-theme="dark"]`, and system-dark fallback. Define base typography, surface, button, input, table, dialog, focus, and motion primitives without selectors that alter game canvases or tool preview content. Add `design-system.css` to `staticFiles` in `server.mjs`.

- [ ] **Step 4: Link the shared layer from all HTML entry files**

Insert `<link rel="stylesheet" href="/design-system.css?v=20260915-1">` before page-specific CSS in `index.html`, `admin.html`, `auth.html`, all utility HTML files, `games.html`, every individual game HTML file, and `video-pricing.html`.

- [ ] **Step 5: Run the contract and server tests**

Run: `node --test tests/design-system.test.mjs tests/api.test.mjs`
Expected: PASS with the new stylesheet reachable and all existing routes intact.

- [ ] **Step 6: Commit**

```bash
git add design-system.css server.mjs tests/design-system.test.mjs *.html
git commit -m "style: add shared purple card design system"
```

### Task 2: Public site, authentication, and account surfaces

**Files:**
- Modify: `styles.css`
- Modify: `auth.css`
- Modify: `index.html`
- Modify: `auth.html`
- Test: `tests/design-system.test.mjs`
- Test: `tests/auth.test.mjs`
- Test: `tests/favorites-ui.test.mjs`

**Interfaces:**
- Consumes Task 1 semantic tokens and shared controls.
- Produces the canonical public shell, content cards, authentication card, and account panels used as visual reference by later tasks.

- [ ] **Step 1: Extend the style contract for public and auth pages**

Assert that `styles.css` and `auth.css` use semantic variables for page background, surfaces, text, border, brand, radii, and shadows. Assert `auth.css` contains one effective root palette rather than its current conflicting teal and purple definitions.

- [ ] **Step 2: Run the focused tests and confirm the new assertions fail**

Run: `node --test tests/design-system.test.mjs tests/auth.test.mjs tests/favorites-ui.test.mjs`
Expected: FAIL on conflicting auth palette and missing shared-token usage.

- [ ] **Step 3: Refactor the public styles**

Remove duplicate token definitions from `styles.css`, retain public layout rules, and map headers, hero areas, tool cards, content cards, filters, comparison tray, dialogs, feedback, policies, empty states, and mobile drawers to the shared system. Keep content hierarchy and all JS hooks unchanged.

- [ ] **Step 4: Refactor authentication and account styles**

Delete the obsolete teal theme and later override duplication in `auth.css`. Use one spacious card layout for login, registration, account details, sessions, favorites, and danger actions. Keep danger controls red and accessible in both themes.

- [ ] **Step 5: Verify focused behavior and responsive layout**

Run the focused Node tests. Open `/`, `/favorites`, `/auth.html` at 1440px and 375px, check navigation, card alignment, dialog focus, theme switch, and absence of page-level horizontal overflow.

- [ ] **Step 6: Commit**

```bash
git add styles.css auth.css index.html auth.html tests/design-system.test.mjs
git commit -m "style: unify public and account surfaces"
```

### Task 3: Spacious admin workspace

**Files:**
- Modify: `admin.css`
- Modify: `admin.html`
- Test: `tests/content-admin.test.mjs`
- Test: `tests/design-system.test.mjs`

**Interfaces:**
- Consumes Task 1 tokens and Task 2 shell conventions.
- Produces wide admin cards, consistent metrics, filters, tables, forms, drawers, dialogs, and status treatments.

- [ ] **Step 1: Add admin design contracts**

Assert that the admin page loads the shared stylesheet, admin CSS does not redeclare the global palette, metric and workspace panels use shared surface/radius/shadow variables, and tables remain horizontally scrollable on narrow viewports.

- [ ] **Step 2: Run the focused tests and confirm contract failure**

Run: `node --test tests/design-system.test.mjs tests/content-admin.test.mjs`
Expected: FAIL while the admin stylesheet owns a duplicate palette and compact legacy spacing.

- [ ] **Step 3: Refactor the admin shell and cards**

Map sidebar/topbar, dashboard metrics, section headers, filter bars, editor panes, tables, monitoring widgets, user panels, audit records, dialogs, toasts, and empty states to the shared system. Increase section gaps and card padding while preserving table row density and all IDs/classes referenced by `admin.js`.

- [ ] **Step 4: Verify admin behavior and responsive layout**

Run focused tests. Open the dashboard and representative CMS, user, monitoring, and settings views at 1440px, 768px, and 375px. Confirm sidebar/drawer operation, tables, forms, dialogs, status colors, focus rings, and both themes.

- [ ] **Step 5: Commit**

```bash
git add admin.css admin.html tests/design-system.test.mjs
git commit -m "style: rebuild admin as spacious card workspace"
```

### Task 4: Utility pages and shared tool shell

**Files:**
- Modify: `utility-theme.css`
- Modify: `image-ai.css`
- Modify: `image-edit.css`
- Modify: `image-erase.css`
- Modify: `link-extract.css`
- Modify: `video-crop.css`
- Modify: `video-gif.css`
- Modify: `video-mask.css`
- Modify: `utilities.html` and each utility HTML entry
- Test: existing image, link, and video utility tests
- Test: `tests/design-system.test.mjs`

**Interfaces:**
- Consumes shared shell and controls.
- Produces consistent utility hero, upload surface, settings card, preview card, progress, result, and error presentation.

- [ ] **Step 1: Add utility coverage to the static contract**

Assert every utility entry loads the shared CSS before `utility-theme.css`, uses the standard site shell, and its page stylesheet references semantic tokens rather than defining a new global palette.

- [ ] **Step 2: Run utility contracts to confirm failure**

Run: `node --test tests/design-system.test.mjs tests/image-*.test.mjs tests/link-extract.test.mjs tests/video-*.test.mjs`
Expected: FAIL on legacy utility styling while behavior tests remain green.

- [ ] **Step 3: Refactor the utility theme and feature styles**

Make `utility-theme.css` own shared utility layout patterns. Reduce feature files to canvas, crop overlay, mask region, upload mechanics, progress visualization, and feature-specific responsive rules. Use common card, button, input, tab, alert, and result styles.

- [ ] **Step 4: Verify representative utility flows**

At desktop and 375px, check `/utilities`, video GIF, crop, mask, image edit, background, enhancement, eraser, and link extraction. Confirm upload areas, controls, progress, disabled states, dialogs, results, theme switching, and no page-level overflow.

- [ ] **Step 5: Run all utility tests and commit**

```bash
npm test
git add utility-theme.css image-*.css link-extract.css video-*.css utilities.html image-*.html link-extract.html video-*.html tests/design-system.test.mjs
git commit -m "style: unify utility workspaces"
```

### Task 5: Game collection and individual game shells

**Files:**
- Modify: `games.css`
- Modify: `game-2048.css`, `memory-game.css`, `breakout.css`, `snake.css`, `gomoku.css`, `flight.css`, `never-retreat.css`
- Modify: corresponding game HTML entries
- Test: all game tests
- Test: `tests/design-system.test.mjs`

**Interfaces:**
- Consumes shared site shell, card, button, and type rules.
- Preserves canvas/board-specific palettes and game logic.

- [ ] **Step 1: Add game shell contracts**

Assert the collection and each game load the shared stylesheet, share standard back navigation, heading and action treatments, and retain named game-specific arena/board selectors.

- [ ] **Step 2: Run game contracts and confirm failure**

Run: `node --test tests/design-system.test.mjs tests/game-2048.test.mjs tests/memory-game.test.mjs tests/breakout.test.mjs tests/snake.test.mjs tests/gomoku.test.mjs tests/flight.test.mjs tests/never-retreat.test.mjs`
Expected: FAIL on inconsistent shells while game logic tests remain green.

- [ ] **Step 3: Unify collection and outer game presentation**

Apply the common content width, page spacing, title rhythm, shell cards, HUD containers, buttons, help cards, footers, focus states, and mobile layout. Leave tiles, canvas backgrounds, game overlays, food, enemies, and theme accents specific to each game.

- [ ] **Step 4: Verify playability and responsive layouts**

Open every game at desktop and 375px; start, pause/restart where available, use keyboard and touch controls, switch themes, and confirm game areas remain visible without page-level overflow.

- [ ] **Step 5: Run focused tests and commit**

```bash
node --test tests/game-2048.test.mjs tests/memory-game.test.mjs tests/breakout.test.mjs tests/snake.test.mjs tests/gomoku.test.mjs tests/flight.test.mjs tests/never-retreat.test.mjs
git add games.css games.html game-2048.* memory-game.* breakout.* snake.* gomoku.* flight.* never-retreat.* tests/design-system.test.mjs
git commit -m "style: unify game collection shells"
```

### Task 6: Video pricing page and final regression

**Files:**
- Modify: `video-pricing.html`
- Modify: `server.mjs` only if cache/CSP requirements change
- Modify: `tests/video-pricing.test.mjs`
- Modify: `tests/design-system.test.mjs`
- Create: `docs/design-system.md`

**Interfaces:**
- Consumes all shared tokens and components.
- Produces the final unified pricing table, comparison panel, update dialog, and export dialog while preserving embedded data and functions.

- [ ] **Step 1: Extend pricing contracts**

Assert the page loads shared CSS, uses semantic variables for background/surface/text/border/brand, keeps all 17 model records, and retains the update, comparison, RMB toggle, and export controls.

- [ ] **Step 2: Run pricing tests and confirm style contract failure**

Run: `node --test tests/design-system.test.mjs tests/video-pricing.test.mjs`
Expected: FAIL because the supplied page still owns a separate palette.

- [ ] **Step 3: Map pricing styles to the system**

Retain the self-contained data and JS behavior. Replace hard-coded page, header, control, table, comparison, modal, notice, and summary colors with semantic tokens. Add dark-theme table price-cell treatments and responsive card spacing. Keep price-tier colors distinct and readable.

- [ ] **Step 4: Document the shared system**

Create `docs/design-system.md` listing token names, allowed component classes, theme behavior, and the rule that new pages load shared CSS before feature CSS. Include examples for cards, buttons, inputs, tables, and game accent overrides.

- [ ] **Step 5: Run complete verification**

Run: `node --check server.mjs`, `node --check app.js`, and `npm test`.
Expected: all checks pass. Browser-check representative public, auth, admin, utility, game, and pricing pages in both themes at 1440px and 375px; capture screenshots for review.

- [ ] **Step 6: Commit**

```bash
git add video-pricing.html server.mjs tests/video-pricing.test.mjs tests/design-system.test.mjs docs/design-system.md
git commit -m "style: complete unified purple card system"
```
