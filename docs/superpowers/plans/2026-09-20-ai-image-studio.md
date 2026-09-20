# AI Image Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the AI image placeholder with a responsive, interactive purple creation studio featuring simulated generation and a basic editable image canvas, then publish it to production.

**Architecture:** Keep the page as dependency-free HTML/CSS/JavaScript within the current Node static-file application. A single page controller owns serializable UI state, while a focused canvas controller owns image decoding, pointer movement, scale, deletion, and PNG export; the simulated generator exposes the same result boundary a future GPT adapter can replace.

**Tech Stack:** Semantic HTML, CSS custom properties, browser File/Object URL/Canvas APIs, vanilla JavaScript ES modules, Node.js 22 test runner, existing production release script.

## Global Constraints

- Preserve the existing global header, navigation order, logo, theme control, and `/image-generation` route.
- Use existing purple design-system variables and support light/dark themes.
- Make no GPT API or other generation network request and include no API key.
- Accept one reference image with MIME `image/*` and maximum size 15MB.
- Support ratios 1:1, 4:3, 3:4, 16:9, and 9:16; styles 自动、电影感、插画、3D、写实、国风; counts 1, 2, and 4.
- Keep prompt text at or below 1000 characters.
- Canvas scope is bitmap upload/import, drag, scale, delete, ratio change, and PNG export only.
- Do not stage or modify unrelated untracked workspace files.

---

### Task 1: Define the Page and Static-Asset Contract

**Files:**
- Modify: `tests/image-generation-placeholder.test.mjs`
- Modify: `server.mjs`
- Modify: `image-generation.html`
- Create: `image-generation.js`

**Interfaces:**
- Produces DOM hooks `#studio-mode-generate`, `#studio-mode-canvas`, `#generation-form`, `#prompt-input`, `#reference-input`, `#generation-results`, `#canvas-stage`, and `#canvas-export`.
- Produces the browser entry point `/image-generation.js` loaded with `defer`.

- [ ] **Step 1: Replace the placeholder assertions with failing studio assertions**

Assert that the route includes both mode controls, form fields, ratio/style/count controls, live status/results regions, the canvas stage, the deferred script, and no API endpoint or key. Keep the sitemap and all-header navigation assertions.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node --test tests/image-generation-placeholder.test.mjs`

Expected: FAIL because the current page contains no form, canvas, or studio script.

- [ ] **Step 3: Add the semantic studio skeleton and static script registration**

Replace the placeholder hero and feature cards with the approved centered studio structure. Add `image-generation.js` to `staticFiles` in `server.mjs`. Create a valid script containing an initial `initImageStudio()` function and a `DOMContentLoaded` listener, without generation logic yet.

- [ ] **Step 4: Run syntax and focused tests**

Run: `node --check image-generation.js` and `node --test tests/image-generation-placeholder.test.mjs`.

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add image-generation.html image-generation.js server.mjs tests/image-generation-placeholder.test.mjs && git commit -m "feat: add AI image studio structure"`.

### Task 2: Build the Responsive Purple Studio Presentation

**Files:**
- Modify: `image-generation.css`
- Modify: `tests/image-generation-placeholder.test.mjs`

**Interfaces:**
- Consumes the DOM hooks and class names from Task 1.
- Produces CSS states `.is-active`, `.is-busy`, `.has-reference`, `.has-results`, `.is-selected`, and `.studio-message[data-tone]`.

- [ ] **Step 1: Add failing stylesheet contract assertions**

Assert the stylesheet contains responsive rules, `:focus-visible`, `prefers-reduced-motion`, the result grid, canvas toolbar/stage, selected layer styling, dark-theme compatible design tokens, and no fixed page width that can create horizontal overflow.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node --test tests/image-generation-placeholder.test.mjs`.

Expected: FAIL on missing studio selectors.

- [ ] **Step 3: Implement the approved visual system**

Create the centered greeting, segmented mode control, 960px composer, dashed reference tile, multiline prompt, wrapping parameter toolbar, purple submit button, inspiration chips, progress/result cards, and canvas workspace. At `900px` and `640px`, move to single-column layouts and full-width controls. Use `var(--brand)`, `var(--brand-soft)`, `var(--bg-surface)`, `var(--border)`, and existing text/shadow variables.

- [ ] **Step 4: Run focused tests**

Run: `node --test tests/image-generation-placeholder.test.mjs`.

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add image-generation.css tests/image-generation-placeholder.test.mjs && git commit -m "style: design purple AI creation studio"`.

### Task 3: Implement Upload, Prompt, Parameters, and Simulated Generation

**Files:**
- Modify: `image-generation.js`
- Modify: `tests/image-generation-placeholder.test.mjs`
- Create: `assets/image-generation/demo-square.svg`
- Create: `assets/image-generation/demo-landscape.svg`
- Create: `assets/image-generation/demo-portrait.svg`
- Modify: `server.mjs`

**Interfaces:**
- Produces `validateReferenceFile(file) -> {ok:boolean, message:string}`.
- Produces `createDemoResults({count, ratio, prompt}) -> Array<{id, src, alt, ratio}>`.
- Produces UI actions `startSimulatedGeneration()`, `downloadResult(result)`, and `sendResultToCanvas(result)`.
- Exposes no global API and performs no `fetch`, `XMLHttpRequest`, or WebSocket call.

- [ ] **Step 1: Add failing behavioral source tests**

Assert that the script enforces `15 * 1024 * 1024`, checks `file.type.startsWith('image/')`, updates the 1000-character counter, handles inspiration chips, prevents empty prompts, disables duplicate submission, represents preparing/generating/completed states, maps count and ratio to local demo assets, revokes replaced Object URLs, and offers download/import actions.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node --test tests/image-generation-placeholder.test.mjs`.

Expected: FAIL on missing validation and generation behaviors.

- [ ] **Step 3: Create three local demo illustrations and register them**

Add SVG artwork in square, landscape, and portrait compositions using purple gradients and abstract image-lab motifs. Add the asset paths to the server static allowlist so every result works without external hosts.

- [ ] **Step 4: Implement the form state and simulation**

Wire upload preview/removal, prompt counting, chips, selectors, inline errors, busy state, timed progress, local result creation, result rendering, downloads, repeat generation, and mode switching. Preserve form state across mode changes and label all outputs “演示结果”.

- [ ] **Step 5: Run syntax and focused tests**

Run: `node --check image-generation.js` and `node --test tests/image-generation-placeholder.test.mjs`.

Expected: PASS.

- [ ] **Step 6: Commit**

Run: `git add image-generation.js server.mjs tests/image-generation-placeholder.test.mjs assets/image-generation && git commit -m "feat: add simulated image generation flow"`.

### Task 4: Implement the Basic Editable Canvas

**Files:**
- Modify: `image-generation.js`
- Modify: `tests/image-generation-placeholder.test.mjs`

**Interfaces:**
- Produces `createCanvasController(elements)` with methods `addImage(source, alt)`, `removeSelected()`, `setScale(value)`, `setRatio(ratio)`, `render()`, and `exportPng()`.
- Consumes result objects from `createDemoResults()` and local uploaded image URLs.

- [ ] **Step 1: Add failing canvas behavior assertions**

Assert source contains image decode before insertion, pointer capture and pointer movement, bounded scale controls, selected-layer deletion, ratio updates, disabled empty export, `canvas.toBlob(..., 'image/png')`, and cleanup of owned Object URLs.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node --test tests/image-generation-placeholder.test.mjs`.

Expected: FAIL on missing canvas controller behavior.

- [ ] **Step 3: Implement the canvas controller**

Maintain a small layer list with `{id, image, src, x, y, scale, width, height, ownedUrl}`. Draw the selected image and selection outline to the visible canvas, translate pointer deltas into canvas coordinates, clamp scale to the toolbar range, resize the backing canvas for ratios, and export through a temporary object URL that is revoked after download.

- [ ] **Step 4: Wire canvas controls and feedback**

Connect upload, generated-result import, mode empty state, select/drag, scale slider/buttons, delete, ratio selector, and export button. Surface decode/export errors in the shared live message region.

- [ ] **Step 5: Run syntax and focused tests**

Run: `node --check image-generation.js` and `node --test tests/image-generation-placeholder.test.mjs`.

Expected: PASS.

- [ ] **Step 6: Commit**

Run: `git add image-generation.js tests/image-generation-placeholder.test.mjs && git commit -m "feat: add editable image canvas"`.

### Task 5: Browser QA and Regression Verification

**Files:**
- Modify as needed: `image-generation.html`
- Modify as needed: `image-generation.css`
- Modify as needed: `image-generation.js`
- Modify: `tests/image-generation-placeholder.test.mjs`

**Interfaces:**
- Verifies the complete page as served by `buildApplication()`.

- [ ] **Step 1: Run the entire automated suite**

Run: `npm test`.

Expected: all tests pass with zero failures.

- [ ] **Step 2: Start the local application and inspect desktop**

Run: `node --env-file-if-exists=.env --no-warnings server.mjs` and open `http://127.0.0.1:3000/image-generation` in the in-app browser. Verify navigation, light/dark modes, generation, result actions, canvas editing, download/export, focus states, and no console errors.

- [ ] **Step 3: Inspect responsive layouts**

Check desktop near 1440×900 and mobile near 390×844. Confirm the composer is centered, no content is shifted right, no horizontal scrolling occurs, controls remain tappable, and results use one column on mobile.

- [ ] **Step 4: Fix only observed defects and rerun verification**

After any fix, run `node --check image-generation.js`, `node --test tests/image-generation-placeholder.test.mjs`, then `npm test`. Repeat browser checks for the affected viewport or behavior.

- [ ] **Step 5: Commit**

Run: `git add image-generation.html image-generation.css image-generation.js tests/image-generation-placeholder.test.mjs && git commit -m "fix: polish AI image studio interactions"`. Skip this commit if no QA changes were needed.

### Task 6: Publish and Verify Production

**Files:**
- Create: `docs/deployment-ai-image-studio-20260920.md`

**Interfaces:**
- Publishes the verified commit to `https://ontimo.cn/image-generation` using the existing production release mechanism.

- [ ] **Step 1: Record the exact release commit and package files**

Run `git rev-parse --short HEAD` and package only tracked project files required by the application. Exclude `.git`, `.superpowers`, temporary output, local databases, secrets, and unrelated untracked files.

- [ ] **Step 2: Create a production snapshot and release**

Use the established production connection and `/opt/nikai-ai/scripts/release-production.sh` process. Create a snapshot under `/opt/nikai-ai-backups/releases/` before switching the active release.

- [ ] **Step 3: Verify the live page and assets**

Check `https://ontimo.cn/image-generation`, `/image-generation.js`, all three demo SVG assets, and the site health endpoint. Confirm the live HTML references the new versioned CSS/JS and returns HTTP 200.

- [ ] **Step 4: Run production interaction smoke tests**

In the browser, verify a prompt can produce demo results, one result enters the canvas, drag/scale/delete work, and PNG export completes. Confirm the global navigation returns to the rest of the site.

- [ ] **Step 5: Document and commit the release**

Record release name, commit, snapshot path, asset checks, automated test total, browser checks, and rollback command in `docs/deployment-ai-image-studio-20260920.md`, then run `git add docs/deployment-ai-image-studio-20260920.md && git commit -m "docs: record AI image studio deployment"`.
