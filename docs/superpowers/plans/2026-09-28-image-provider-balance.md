# 生图平台余额查询 Implementation Plan

> **For agentic workers:** Implement the tasks in order and use test-driven development. Each task has a self-contained verification step.

**Goal:** Let administrators query each configured image provider's live balance securely from the image-platform cards.

**Architecture:** Persist an optional relative balance endpoint and JSON field selectors on each provider. A management-only server route decrypts and uses the stored provider key, validates the same-origin upstream target, parses a small JSON response, and returns a normalized balance without persisting it. The admin card displays configured/unsupported state, value, currency, and query time.

**Tech Stack:** Node.js ES modules, built-in `node:test`, SQLite local / MariaDB production migrations, vanilla JavaScript admin UI.

## Global Constraints

- Reuse existing platform management authentication and encrypted provider keys.
- Keep provider keys out of browser responses, logs, and new audit records.
- Balance endpoints must be relative paths on the configured HTTPS provider host.
- Store configuration only; never persist a returned balance as if it were live.
- Keep existing image generation behavior unchanged.

---

### Task 1: Persist optional balance-query configuration

**Files:**
- Create: `backend/migrations/018_image_provider_balance.sql`
- Create: `backend/mariadb/migrations/018_image_provider_balance.sql`
- Modify: `backend/database.mjs`
- Modify: `backend/image-provider-store.mjs`
- Test: `tests/image-provider-store.test.mjs`
- Test: `tests/mariadb-compat.test.mjs`

- [ ] Add failing tests that new providers default to no balance path and updates/list reads preserve `balancePath`, `balanceValueField`, and `balanceCurrencyField`.
- [ ] Run `node --test tests/image-provider-store.test.mjs` and confirm the new assertions fail because fields are absent.
- [ ] Add migration 018 to SQLite and MariaDB, adding nullable path and bounded field-selector columns; register version 18 in `backend/database.mjs`.
- [ ] Map and persist the three settings in `backend/image-provider-store.mjs` and include them in audit snapshots (they are not secrets).
- [ ] Run the focused store and MariaDB compatibility tests.

### Task 2: Validate provider settings and implement safe balance lookup

**Files:**
- Create: `backend/image-provider-balance.mjs`
- Modify: `backend/validation.mjs`
- Modify: `backend/image-provider-store.mjs`
- Modify: `server.mjs`
- Test: `tests/image-provider-balance.test.mjs`
- Test: `tests/image-provider-api.test.mjs`
- Test: `tests/image-provider-operations.test.mjs`

- [ ] Add failing tests for provider-field validation, relative-path-only requests, successful numeric balance parsing, currency parsing, absent configuration, unsafe path rejection, timeout, non-JSON response, non-2xx response, and missing/invalid balance fields.
- [ ] Run the focused new tests and confirm they fail because the settings and query behavior do not exist.
- [ ] Extend `validateImageProvider` with optional `balancePath`, `balanceValueField`, and `balanceCurrencyField`; constrain paths to an absolute in-origin path and field selectors to safe dot-separated object keys with a short maximum length.
- [ ] Add a balance query service using the stored platform base URL and decrypted API key; enforce HTTPS, same-host relative URL construction, timeout, response-size limit, JSON content type/body parsing, and numeric balance validation.
- [ ] Add `POST /api/admin/v1/image-providers/:id/balance` under existing management auth; return normalized data and safe, non-sensitive errors without adding raw upstream responses to logs.
- [ ] Run focused tests and verify success and denial paths.

### Task 3: Configure and display live balances in admin

**Files:**
- Modify: `public/admin.html`
- Modify: `public/admin.js`
- Modify: `public/admin.css`
- Test: `tests/admin-image-models.test.mjs`
- Test: `tests/admin-image-workspace-behavior.test.mjs`
- Test: `tests/admin-layout.test.mjs`

- [ ] Add failing UI tests for editable optional endpoint/field settings and provider-card states (not configured, querying, success with amount/currency/time, and failure).
- [ ] Run the relevant UI tests and confirm the new behavior is absent.
- [ ] Add optional balance endpoint and JSON selector inputs in the provider editor with an example response shape and a note that endpoint formats vary by provider.
- [ ] Add a “查询余额” action and status area per provider card; send only provider ID and admin authorization to the new route, and show the server-returned balance/currency/timestamp using text nodes.
- [ ] Keep nonconfigured providers clearly marked; disable the query action when no endpoint is configured; prevent duplicate requests per provider.
- [ ] Run targeted UI tests and inspect responsive/layout assertions.

### Task 4: Full verification and release readiness

**Files:**
- Modify: `docs/production-release.md` only if release notes need a migration note.

- [ ] Run focused provider, admin, and migration test suites.
- [ ] Run `npm test` and `npm run start`/existing health smoke test as appropriate.
- [ ] Check `git diff --check` and inspect the final diff for secret leakage, unrelated changes, and the requirement that balance values are not stored.
- [ ] Verify the MariaDB migration path and release procedure apply migration 018 before the service begins serving the route.

## Coverage review

The design's UI states, live response, no-secret boundary, host/path safety, provider variation, timeout/error handling, SQLite/MariaDB migration parity, and unchanged image-generation behavior are covered above.
