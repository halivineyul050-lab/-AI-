# Site Logo Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every site-level brand icon with optimized 192×192 and 512×512 PNG exports from the approved source image and publish them.

**Architecture:** Keep the established `/brand-icon-192.png` URL for compatibility, add `/brand-icon-512.png`, and update the Web App Manifest plus versioned HTML references. Validate the binary image contract and public routes with automated tests before production release.

**Tech Stack:** PNG, Node.js HTTP server and test runner, Web App Manifest, existing SSH production release workflow.

## Global Constraints

- Use the supplied PNG as the sole visual source without redrawing it.
- Preserve transparency and square composition.
- Export exactly 192×192 and 512×512 PNG files.
- Keep navigation text, layout, and rendered logo size unchanged.
- Bust old browser caches for visible brand references.

---

### Task 1: Define the icon contract

**Files:**
- Modify: `tests/api.test.mjs`
- Modify: `tests/design-system.test.mjs`

- [ ] Add failing assertions for both icon routes, exact PNG dimensions, alpha support, Manifest icon entries, and a current cache version in site-level HTML.
- [ ] Run the focused tests and confirm they fail because the 512 icon and new metadata do not exist.

### Task 2: Generate and wire the new assets

**Files:**
- Modify: `brand-icon-192.png`
- Create: `brand-icon-512.png`
- Modify: `manifest.webmanifest`
- Modify: `server.mjs`
- Modify: site-level HTML files that reference `/brand-icon-192.png`

- [ ] Inspect source dimensions and alpha channel.
- [ ] Export both PNG sizes with high-quality downsampling, preserving transparency.
- [ ] Add the 512 asset to the static allowlist and both sizes to the Manifest.
- [ ] Add `v=20260916-2` to site brand and favicon references while leaving tool-specific logos untouched.
- [ ] Run focused tests until green.

### Task 3: Verify and commit

- [ ] Run the full test suite.
- [ ] Open the local site in a browser and verify the navigation logo and favicon resource.
- [ ] Stage only the two icon assets, Manifest, references, server allowlist, and tests.
- [ ] Commit as `feat: replace site brand logo`.

### Task 4: Publish and verify

- [ ] Package only the committed Logo release files.
- [ ] Deploy with `scripts/release-production.sh` so backup, tests, restart, and health checks run.
- [ ] Verify both public icon URLs, dimensions, hashes, Manifest entries, representative pages, nginx, and `nikai-ai.service`.
