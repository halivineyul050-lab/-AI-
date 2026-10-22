# Account Image Cloud History Implementation Plan

> **For agentic workers:** Use subagent-driven-development for independent storage and frontend tasks; root owns API integration, review, validation, and release.

**Goal:** Save every newly generated image to the signed-in account's durable history until manual deletion, without new browser-local image storage.

**Architecture:** Store account-scoped metadata and image BLOB chunks in SQLite/MariaDB. Return authenticated durable media URLs, paginate history, preserve legacy local history separately, and retain clearly labeled temporary results when cloud saving fails.

**Tech Stack:** Node.js 22.18.0, native Node test runner, vanilla browser JavaScript, SQLite and MariaDB 10.5.

## Global Constraints

- Approved design: `docs/superpowers/specs/2026-09-30-image-cloud-history-design.md`.
- Base is verified production `image-no-local-save-20260930-1`; root workspace contains unrelated work and must never be packaged wholesale.
- Migration version is 20, leaving unrelated unshipped version 19 untouched.
- All new API requests are account-scoped; no expiry or automatic history eviction; existing 10 MiB per-image validation remains.
- Deployment uses only existing production release script and existing verified SSH identity.

## Task 1: Durable history storage

Files: backend/image-cloud-history-store.mjs, backend/migrations/020_image_cloud_history.sql, backend/mariadb/migrations/020_image_cloud_history.sql, backend/database.mjs, backend/mariadb-compat.mjs, relevant migration/store tests.

Interface: `createImageCloudHistoryStore(db, {now=Date.now}={})`; `save(userId, {generationId,prompt,modelName,ratio,style,images:[{id,mimeType,bytes}]})` returns metadata items; `list(userId,{limit=24,cursor}={})` returns `{items,total,nextCursor}`; `getImage(userId,id)` returns `{id,mimeType,bytes}` or null; `remove(userId,id)` returns boolean; `clear(userId)` returns deleted count. Metadata includes id, generationId, prompt, modelName, ratio, style, mimeType, byteLength, createdAt; API adds URL.

- [ ] Add meaningful tests for persistence, >50 images, pagination, isolation, atomic failure and deletion.
- [ ] Implement SQLite/MariaDB migrations and transactional store. MariaDB BLOB parameters use FROM_BASE64; single-image reads use TO_BASE64.
- [ ] Run targeted store and migration tests and review both dialects.

## Task 2: Authenticated generation and history APIs

Files: server.mjs, tests/image-generation-api.test.mjs, tests/image-cloud-history-api.test.mjs, affected request fixtures.

- [ ] Require account session before parsing a generation body or making any paid upstream request.
- [ ] Persist generated validated bytes before returning cloud URLs. Return `historySaved:true` on success; on persistence failure expose existing temporary results only to the same owner with `historySaved:false`.
- [ ] Add owner-scoped history list/media/delete/clear endpoints, no-store headers, bounded pagination and rate limits. Reuse existing origin checks for cookie-authenticated mutations.
- [ ] Test anonymous access, cross-account access, state after application restart, delete/clear, and failure fallback.

## Task 3: Account-aware studio and history UI

Files: public/image-generation.js, public/image-generation.html, public/image-generation.css, tests/image-generation-ui.test.mjs, tests/image-generation-placeholder.test.mjs.

API contract: GET history returns `{data:{items:[{id,generationId,prompt,modelName,ratio,style,mimeType,byteLength,createdAt,url}],total,nextCursor}}`; mutations return `{data:{deleted:true}}` or `{data:{deleted:number}}`; media URL is `/api/v1/image-history/:id/image`. All are same-origin session-authenticated. Generation response retains generationId/images and adds historySaved; persistent image expiresAt is null.

- [ ] Probe auth and show login action before generation. Preserve current form contents while prompting for login.
- [ ] Render cloud history, count, pagination, preview/download/delete/clear; handle loading, empty, expired login and server failure explicitly.
- [ ] Keep existing local history in an explicitly labeled legacy section with its own delete/clear actions; never add new images to IndexedDB or automatically upload old images.
- [ ] Prevent stale requests and pending mutations from overwriting a newer account/history view. Test core interactions and update asset versions.

## Task 4: Review, publish and record

- [ ] Review scoped diff, run complete tests, syntax checks and logo verification from the production-based tree.
- [ ] Verify MariaDB packet capacity and deployed migration via safe read-only owner queries; do not print configuration credentials.
- [ ] Build complete archive from original production snapshot plus reviewed changes only. Exclude real configs, databases, user content, node_modules and Git metadata. Audit hashes and contents.
- [ ] Upload and compare SHA-256; invoke existing release-production.sh and retain backups and rollback paths.
- [ ] Verify actual public page/API, service health, account authentication boundary and durable store. Record result in docs/deployment-image-cloud-history-20260930.md.
