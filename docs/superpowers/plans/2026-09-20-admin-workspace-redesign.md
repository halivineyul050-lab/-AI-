# Admin Workspace Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the management-token screen and operations dashboard as a spacious, responsive purple-card workspace without changing authentication, API, or database behavior.

**Architecture:** Keep the existing HTML and JavaScript behavior, add only stable presentation hooks where required, and replace the accumulated CSS overrides with one coherent layout system. Add static regression tests for layout contracts, then verify real rendering and existing interactions in desktop and mobile browsers.

**Tech Stack:** Semantic HTML, plain CSS, existing vanilla JavaScript, Node.js test runner, browser visual QA.

## Global Constraints

- Preserve every monitoring, CMS, account-permission, feedback, and submission-review behavior.
- Do not add third-party frontend dependencies or change APIs, database structure, or authorization rules.
- Use a light purple-gray background, white cards, restrained purple accents, clear borders, and generous spacing.
- Support desktop, tablet, and 390px mobile widths without page-level horizontal overflow.
- Preserve keyboard focus, semantic headings, ARIA states, textual status feedback, and reduced-motion support.

---

### Task 1: Add visual layout contracts

**Files:**
- Create: `tests/admin-layout.test.mjs`
- Test: `tests/admin-layout.test.mjs`

**Interfaces:**
- Consumes: existing `auth.html`, `auth.css`, `admin.html`, and `admin.css` files.
- Produces: static layout contracts for authentication, dashboard cards, tables, responsive navigation, focus, and reduced motion.

- [ ] **Step 1: Write failing authentication layout tests**

Assert that admin authentication markup exposes dedicated brand and form regions, and that CSS defines a two-column shell, a single-column narrow-screen state, full-width token controls, and no negative margins on the authentication card.

- [ ] **Step 2: Write failing dashboard layout tests**

Assert that dashboard CSS defines a bounded main workspace, adaptive KPI grid, card design tokens, mobile top navigation, scrollable table containers, `:focus-visible`, and `prefers-reduced-motion`.

- [ ] **Step 3: Run the focused test and confirm the expected failures**

Run: `node --no-warnings --test tests/admin-layout.test.mjs`

Expected: FAIL because the new layout hooks and consolidated style contracts do not yet exist.

### Task 2: Redesign the management-token screen

**Files:**
- Modify: `auth.html`
- Modify: `auth.css`
- Test: `tests/admin-layout.test.mjs`

**Interfaces:**
- Consumes: the existing `#admin-auth-panel`, `#admin-auth-form`, `#admin-auth-token`, and `auth.js` behavior.
- Produces: `.admin-auth-layout`, `.admin-auth-intro`, and `.admin-auth-form-card` presentation regions without changing IDs used by JavaScript.

- [ ] **Step 1: Add semantic presentation wrappers**

Wrap the existing administrator copy and token form in dedicated intro and form-card regions. Keep every existing form control ID, name, label, error element, and submit behavior unchanged.

- [ ] **Step 2: Replace the admin authentication styles**

Implement a centered two-column card at desktop widths, stable heading flow, aligned token input and button, explicit error spacing, a one-column layout below 900px, and compact 390px spacing below 640px.

- [ ] **Step 3: Run focused tests**

Run: `node --no-warnings --test tests/admin-layout.test.mjs tests/auth.test.mjs`

Expected: authentication layout assertions and account behavior tests PASS.

- [ ] **Step 4: Commit authentication redesign**

```bash
git add auth.html auth.css tests/admin-layout.test.mjs
git commit -m "feat: redesign admin token authentication"
```

### Task 3: Consolidate the operations dashboard layout

**Files:**
- Modify: `admin.html`
- Modify: `admin.css`
- Test: `tests/admin-layout.test.mjs`

**Interfaces:**
- Consumes: all existing element IDs and classes used by `admin.js`.
- Produces: a stable sidebar, bounded content canvas, grouped topbar, spacious KPI cards, shared panel surfaces, and consistent toolbar/table/dialog presentation.

- [ ] **Step 1: Add minimal grouping hooks to the topbar and sidebar**

Add classes only where the existing structure cannot express the four topbar groups or mobile navigation. Do not rename or remove IDs and `data-*` attributes used by JavaScript.

- [ ] **Step 2: Consolidate color, spacing, typography, and surface tokens**

Define one admin token layer for background, surface, border, purple accent, shadows, radii, sidebar width, content width, and control height. Override or remove conflicting legacy declarations so each component has one final source of truth.

- [ ] **Step 3: Implement desktop workspace composition**

Use a fixed sidebar and centered bounded main canvas. Arrange the topbar into coherent groups, render KPI cards in an adaptive 4/3-column grid, and give charts, lists, health, CMS, feedback, account permissions, and review areas the same surface system.

- [ ] **Step 4: Normalize controls, tables, lock panels, and dialogs**

Align buttons, selects, inputs, status badges, filters, pagination, lock forms, table rows, empty states, and dialog footers. Keep table wrappers horizontally scrollable and dialogs vertically scrollable within the viewport.

- [ ] **Step 5: Implement tablet and mobile composition**

At 1180px reduce navigation width and KPI columns. At 760px move navigation to a sticky horizontal top strip, stack topbar groups and forms, use single-column cards, and prevent page-level overflow. At 390px preserve minimum 44px interactive targets.

- [ ] **Step 6: Run focused tests**

Run: `node --no-warnings --test tests/admin-layout.test.mjs tests/api.test.mjs tests/monitoring.test.mjs tests/content-admin.test.mjs`

Expected: all focused tests PASS.

- [ ] **Step 7: Commit dashboard redesign**

```bash
git add admin.html admin.css tests/admin-layout.test.mjs
git commit -m "feat: redesign admin operations workspace"
```

### Task 4: Browser verification and production release

**Files:**
- Modify: `docs/deployment-admin-workspace-20260920.md`

**Interfaces:**
- Consumes: completed authentication and dashboard layouts.
- Produces: verified local behavior, production release evidence, rollback snapshot, and live URL checks.

- [ ] **Step 1: Run the complete automated suite**

Run: `npm test`

Expected: all tests PASS with zero failures.

- [ ] **Step 2: Verify the authentication page in a browser**

Check `?mode=admin&next=%2Fadmin.html` at 1440px, 1024px, and 390px. Confirm no heading overlap, no page-level overflow, visible focus states, readable errors, and working token submission.

- [ ] **Step 3: Verify the dashboard in a browser**

Unlock with the configured token and inspect overview, charts, CMS, permissions, feedback, and review sections. Confirm navigation, filters, tables, dialogs, lock controls, and responsive layouts work without console errors.

- [ ] **Step 4: Publish through the existing release process**

Package only the changed production files and tests, publish with `/opt/nikai-ai/scripts/release-production.sh`, verify file hashes, service health, `/admin`, `/admin.html`, authentication assets, and token-authorized summary access.

- [ ] **Step 5: Record release evidence**

Document the release name, commit, timestamp, rollback snapshot, local and production test totals, browser viewport checks, HTTP results, service health, and hash verification in `docs/deployment-admin-workspace-20260920.md`.

- [ ] **Step 6: Commit deployment record**

```bash
git add docs/deployment-admin-workspace-20260920.md
git commit -m "docs: record admin workspace deployment"
```
