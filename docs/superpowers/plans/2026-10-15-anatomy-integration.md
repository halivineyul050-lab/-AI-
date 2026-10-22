# Anatomy Explainer Implementation Plan

> **For agentic workers:** Use subagent-driven-development for isolated implementation tasks and review each deliverable. Execute continuously; user approved integration on 2026-10-15.

**Goal:** Upgrade /explain with safe isometric parts, exploration, guided steps, speech and independent provider configuration.

**Architecture:** Version 2 data scenes use a fixed, audited Anatomy geometry adapter; no generated code runs. A persistent generation job wraps the runner and exposes actual task phases. Configuration reuses encrypted secrets and defaults to explicit assistant inheritance.

**Tech Stack:** Node ESM, existing SQL adapter/migrations, vanilla browser JS/SVG, pinned Anatomy MIT iso-kit.

## Global constraints

Production complete source baseline only; isolated stage C:/Users/zhanglian2/AppData/Local/Temp/nikai-anatomy-integration-20261015/app. Do not package dirty root. Release only through existing SSH production script. No video export in this approved interactive increment. No arbitrary model HTML/JS, no raw secrets or user question logs. Keep old scenes and existing generate API compatible.

## Shared scene contract

Version2 retains title/summary/reason/try/assumptions/variables/controls. Adds `version:2`, `parts:[{id,name,description,type,position:[x,y,z],size:[w,d,h],tone,rotation,explode:[x,y,z]}]` and `steps:[{title,text,parts:[id],values:{variable:number},duration:seconds}]`. Types box/cylinder/gear/spring/pipe. Position/rotation support existing expression AST; size/explode are finite bounded constants. Adapter creates purposeful fasteners, faces and shading, not generated markup. Max80 parts,12steps,6controls; scene serialized <=48000 chars for existing share compatibility. Part dimensions positive; IDs unique; all references valid; step values in ranges; every phase sampled. Unknown fields are dropped. validateScene handles both versions. Renderer mountAnatomy(stage,controls,scene,onChange) returns scene(),destroy(). It owns step/play/pause/speech/explode/zoom/select controls, cancels timers/speech on destroy, and supports reduced motion and accessible inputs.

## Task 1: Geometry/schema/rendering

- [x] Add failing unit tests for version2 bounded validation, references, expressions, parts and steps. Run `node --test tests/anatomy-scene.test.mjs` and observe missing implementation failure.
- [x] Copy audited iso-kit.mjs and MIT LICENSE into public/vendor/anatomy with upstream commit attribution. No upstream scripts executed at runtime.
- [x] Implement public/anatomy-scene.mjs validator; public/anatomy-renderer.mjs using kit numeric geometry; update public/explain-scene.mjs version dispatch. Add scoped public/anatomy.css.
- [x] Test expression boundary and step cases; browser-test controls, dark/light/mobile and destroy lifecycle.

## Task 2: Configuration and durable storage

- [x] Test inherited and independent configuration, secret preservation/clearing, enable validation, usage reservation/refund and concurrency.
- [x] Implement backend/explainer-config.mjs exporting createExplainerStore(db,box,assistantStore). API: config(),publicConfig(),configure(input,options),key(),assertUser(user),reserve(user,limit),settle(user,reservation,refund). In inherit mode reserve/settle delegate to assistant store, preserving existing daily quota rules. Independent mode uses explainer_usage. No hidden switching on assistant failure.
- [x] Add compatible SQLite/Maria migration for explainer_provider,explainer_usage,explainer_tasks. Tasks fields id,user_id,request_key,state,question,mode,level,result,error_code,created_at,updated_at; unique(user_id,request_key). Wire migration lists and verification.
- [x] Implement public/admin-explainer.js self-contained configuration panel mounted next to assistant config; authenticated admin GET/PUT /api/admin/v1/explainer/provider. User sees explicit mode,enabled,endpoint,model,key and dailyLimit. Root integrates routes/assets only.

## Task 3: Generation and durable tasks

- [x] Test version2 provider prompt without fixed-topic fallback; repair once, safe diagnostics, failure refunds. Keep version1 accepted for backwards test/API compatibility, request version2 for new scenes.
- [x] Update backend/explainer.mjs to teach exact scene contract and use phase callback planning/building/checking/repairing. Requests use configurable30–180seconds (default120) and2000–24000tokens (default12000); reservation lease is timeout plus five seconds.
- [x] Implement backend/explainer-jobs.mjs createExplainerJobs(db,runner), submit(user,input,requestKey),get(user,id),shutdown(). Persist before scheduling; active duplicate key reuses job. Run runner once, persist scene/error, enforce owner reads, cap global pending/concurrent; expired/restarted tasks fail visibly with no provider replay. Coordinate reservation/refund recovery explicitly with store tokens; no claim of restart safety until tested. Root integrates handlers GET/POST /api/v1/explain/tasks and GET /api/v1/explain/tasks/:id.

## Task 4: Product integration and verification

- [x] Root adds tests for route authorization, private job lookup, polling and idempotent submit; integrate store/jobs/static assets/admin script.
- [x] Update public/explain.js to use jobs, persist pending ID per user-safe server verification, restore after reload, show actual phase labels, mount appropriate scene version and destroy on navigation/replacement. Configuration fetched from /api/v1/explain/config. Retain question drafts, share and last scene.
- [x] Update public/explain.html/CSS with concise feature descriptions and upstream attribution. Browser validates genuine arbitrary-topic model outputs, step/highlight/part selection/explode/zoom/speech feature availability and legacy demos. No mock result called real generation.
- [x] npm ci; node --check server and all frontend scripts; npm test; npm run logos:verify. Review all overlays against production baseline. Full hash-matched release, verify public page/API and service, record version/backups and clean owned temporary remote files.

## Execution evidence

Implemented in production-baseline isolated stage; reviewed33source/test files plus admin navigation change. Reviewer found canonical-step mismatch and pending owner exposure; both fixed with regression tests. Full local654:651pass,3platformskip,0fail; production654allpass. Release anatomy-20261015-1 succeeded2026-10-15 14:36:36+08:00. Actual model results: car50parts/4steps, watch23parts/5steps, TCP50parts/5steps. Failures observed during tuning were retained as errors, not replaced with fixed examples. See deployment record for public endpoint verification.
