# Games Editorial Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将休闲小游戏大厅重排为用户选择的杂志式不对称紫色卡片布局，并安全发布到线上。

**Architecture:** 在现有静态 `games.html` 中为九张卡片增加布局角色类，并在 `games.css` 中用 CSS Grid 实现桌面 12 列、中屏两列、手机单列。游戏路由、卡片内容和服务端逻辑保持不变。

**Tech Stack:** HTML5, CSS Grid, Node.js test runner, existing shell release scripts

## Global Constraints

- 保留九款游戏及其现有 URL、名称、说明和控制信息。
- 继续使用现有设计变量与紫色卡片风格，不增加前端依赖。
- 不修改游戏运行代码或其他网站页面。
- 发布必须使用 `/opt/nikai-ai/scripts/release-production.sh`，并验证线上结果。

---

### Task 1: Add layout roles and automated assertions

**Files:**
- Modify: `games.html`
- Modify: `tests/production-games.test.mjs`

**Interfaces:**
- Consumes: existing `.games-grid` and `.game-card` markup.
- Produces: `.game-card--hero`, `.game-card--wide`, `.game-card--compact` layout hooks.

- [ ] **Step 1: Add assertions for one hero, two wide, six compact cards**

Extend the `/games` test to count the three role classes and keep the existing nine-card assertion.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `node --test tests/production-games.test.mjs`

Expected: role-class assertions fail because the hooks do not exist yet.

- [ ] **Step 3: Reorder cards and add the role classes**

Place “一人不撤2 · 残铁战线” first as the hero, “一人不撤” and “用不后退” next as wide cards, then mark the remaining six cards compact. Keep every href and text value unchanged.

- [ ] **Step 4: Run the focused test**

Run: `node --test tests/production-games.test.mjs`

Expected: all focused tests pass.

### Task 2: Implement the editorial grid

**Files:**
- Modify: `games.css`

**Interfaces:**
- Consumes: role classes from Task 1.
- Produces: responsive 12-column, two-column, and one-column layouts.

- [ ] **Step 1: Replace the equal two-column grid**

Use a 12-column grid. Assign the hero to six columns and two rows, each wide card to six columns, and compact cards to four columns. Set card content to flex so metadata remains aligned.

- [ ] **Step 2: Add visual hierarchy**

Increase hero art and title scale, use horizontal composition for wide cards, and reduce compact-card art/copy sizes without removing content.

- [ ] **Step 3: Add responsive breakpoints and focus styling**

At 1079px use two columns; below 720px use one column. Add `:focus-visible` styling and ensure reduced-motion behavior remains intact.

- [ ] **Step 4: Run the complete local suite**

Run: `npm test`

Expected: all tests pass with zero failures.

### Task 3: Verify and release

**Files:**
- Create: `docs/deployment-games-layout-20260916.md`

**Interfaces:**
- Consumes: tested `games.html`, `games.css`, and updated test file.
- Produces: production release record and verified live layout.

- [ ] **Step 1: Inspect desktop, tablet, and mobile widths**

Verify `/games` at 1440px, 1024px, and 390px. Confirm nine visible entries, readable copy, correct hierarchy, and no horizontal overflow.

- [ ] **Step 2: Commit the implementation**

Stage only the intended page, CSS, test, plan, spec, and ignore-file changes. Commit with a focused message.

- [ ] **Step 3: Build and upload the release archive**

Create an archive from tracked files, upload through the existing authorized SSH path, and run:

```bash
bash /opt/nikai-ai/scripts/release-production.sh /tmp/nikai-games-editorial-layout.tgz games-layout-20260916
```

- [ ] **Step 4: Verify production**

Confirm the release script succeeds, production tests pass, `https://ontimo.cn/games` returns 200, and the deployed HTML/CSS hashes match local files.

- [ ] **Step 5: Record deployment evidence**

Write the release ID, rollback snapshot, test totals, hash checks, and live URL to `docs/deployment-games-layout-20260916.md`, then commit the record.
