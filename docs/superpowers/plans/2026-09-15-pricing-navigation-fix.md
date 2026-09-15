# Pricing Page Navigation Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore global navigation and a direct homepage return action on the video pricing page.

**Architecture:** Reuse the utility-page site header markup and responsive navigation assets inside the standalone pricing HTML. Keep the price table implementation unchanged.

**Tech Stack:** Static HTML/CSS, shared browser JavaScript, Node.js test runner.

## Global Constraints

- The pricing data and interactions remain unchanged.
- The direct return link targets `/`.
- The current navigation item is “视频模型价格”.

---

### Task 1: Navigation regression and implementation

**Files:**
- Modify: `tests/video-pricing.test.mjs`
- Modify: `video-pricing.html`

- [ ] Add assertions for `.site-header`, `aria-current="page"`, the `/` return link, and shared responsive navigation assets.
- [ ] Run `node --test tests/video-pricing.test.mjs` and confirm failure because the header is absent.
- [ ] Add the shared header, return link, CSS assets, responsive script, and move page padding to `.container`.
- [ ] Run the focused test and complete `npm test`.
- [ ] Check desktop and mobile layouts in a browser, then publish through the established release script.
