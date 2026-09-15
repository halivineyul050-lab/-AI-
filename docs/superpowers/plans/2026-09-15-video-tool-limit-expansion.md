# Video Tool Limit Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand local video tools to accept practical inputs up to 500MB, 30 minutes, and 4K while preserving GIF workload and browser memory protections.

**Architecture:** Put shared numeric limits and validation in a small browser-compatible core module, then consume the same values from crop, mask, and GIF loaders. Keep crop and mask's full-file FFmpeg workflow, extend its timeout to 30 minutes, and retain the GIF frame-plan work cap.

**Tech Stack:** Browser JavaScript modules, FFmpeg WebAssembly workers, Node.js built-in test runner, static HTML/CSS.

## Global Constraints

- Maximum source file size is exactly 500MB for all three video tools.
- Crop and mask accept at most 30 minutes and a longest edge of 3840px.
- GIF source duration and resolution have no added hard cap; its existing output workload limits remain active.
- Crop and mask export timeout is exactly 30 minutes.
- Video processing remains local and uploads no user files.

---

### Task 1: Shared input-limit validation

**Files:**
- Create: `video-input-limits.js`
- Create: `tests/video-input-limits.test.mjs`
- Modify: `server.mjs`

**Interfaces:**
- Produces: `VIDEO_MAX_BYTES`, `VIDEO_MAX_DURATION`, `VIDEO_MAX_EDGE`, `validateVideoFile(file)`, and `validateFullVideoMetadata({duration,width,height})`.

- [ ] **Step 1: Write failing boundary tests**

Test literal boundaries: 500 × 1024 × 1024 bytes passes; one byte more fails; 1800 seconds and 3840px pass; 1800.01 seconds and 3841px fail; zero and non-finite values fail.

- [ ] **Step 2: Verify the test fails**

Run `node --test tests/video-input-limits.test.mjs`; expect module-not-found.

- [ ] **Step 3: Implement the shared module and expose it**

Export the exact constants and validators. Error messages must name `500MB`, `30 分钟`, and `3840px`. Add `video-input-limits.js` to `staticFiles`.

- [ ] **Step 4: Verify the focused test passes**

Run `node --test tests/video-input-limits.test.mjs tests/api.test.mjs`; expect all tests to pass.

### Task 2: Crop and mask consume shared limits

**Files:**
- Modify: `video-crop.js`
- Modify: `video-crop-core.js`
- Modify: `video-crop.html`
- Modify: `video-mask.js`
- Modify: `video-mask-core.js`
- Modify: `video-mask.html`
- Modify: `tests/video-crop.test.mjs`
- Modify: `tests/video-mask.test.mjs`

**Interfaces:**
- Consumes: shared validators and constants from `video-input-limits.js`.

- [ ] **Step 1: Add failing boundary coverage to existing tests**

Assert crop and mask accept `{duration:1800,width:3840,height:2160}` and reject values immediately above either maximum.

- [ ] **Step 2: Verify the tests fail on old 120-second/1920px behavior**

Run `node --test tests/video-crop.test.mjs tests/video-mask.test.mjs`; expect boundary assertions to fail.

- [ ] **Step 3: Replace duplicated limits and update interface copy**

Use `validateVideoFile(candidate)` before object URL creation and `validateFullVideoMetadata(...)` after metadata loads. Change both dropzone descriptions to `最多 500MB、30 分钟、最长边 3840px` and add the large-file performance note. Change export timeout from `600000` to `1800000` milliseconds and its message from 10 to 30 minutes.

- [ ] **Step 4: Verify crop and mask tests pass**

Run `node --test tests/video-crop.test.mjs tests/video-mask.test.mjs tests/video-input-limits.test.mjs`.

### Task 3: GIF source limit and regression protection

**Files:**
- Modify: `video-gif.js`
- Modify: `video-gif.html`
- Modify: `tests/video-gif.test.mjs`

**Interfaces:**
- Consumes: `validateVideoFile(file)` only; the existing `buildFramePlan(...)` remains the output-work guard.

- [ ] **Step 1: Add a failing 500MB source-boundary assertion**

Exercise the shared validator from the GIF test and retain all existing invalid frame-plan cases.

- [ ] **Step 2: Verify failure against the old 200MB loader rule**

Run `node --test tests/video-gif.test.mjs tests/video-input-limits.test.mjs`.

- [ ] **Step 3: Use the shared file validator and update copy**

Replace the 200MB inline check, display `最多 500MB`, and add text explaining that long source videos are supported while GIF output remains limited by the chosen clip, size, and frame rate.

- [ ] **Step 4: Verify GIF tests pass**

Run `node --test tests/video-gif.test.mjs tests/video-input-limits.test.mjs`.

### Task 4: Browser regression, full verification, and production release

**Files:**
- Modify: the three HTML asset version query strings.
- Create: `docs/deployment-video-limit-expansion-20260915.md`

**Interfaces:**
- Produces: verified production release with a rollback snapshot.

- [ ] **Step 1: Run the complete suite**

Run `npm test`; expect zero failures.

- [ ] **Step 2: Inspect all three pages in desktop and mobile browser sizes**

Confirm the new limits appear, navigation still works, no horizontal overflow exists, and browser console has no new errors.

- [ ] **Step 3: Commit the implementation**

Commit only the planned source, tests, and page files; preserve unrelated untracked workspace materials.

- [ ] **Step 4: Publish the exact changed-file archive**

Use the established SSH release script. Verify remote hashes, production tests, service and Nginx status, database readiness, and source-origin HTTP 200 for all three video tool routes.

- [ ] **Step 5: Record release evidence**

Document release ID, timestamps, test totals, hash count, health results, and rollback snapshot in `docs/deployment-video-limit-expansion-20260915.md` and commit it.
