# MariaDB Primary Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all production relational data from SQLite to MariaDB 10.5 and make MariaDB the only production write database.

**Architecture:** Add an asynchronous MariaDB adapter using `mysql2/promise`, preserve SQLite for isolated tests, and convert application database calls to await a common asynchronous contract. Provision versioned MariaDB schema, deterministic migration and verification scripts, least-privilege accounts, and MariaDB backups before a stopped-service cutover.

**Tech Stack:** Node.js 22 ESM, `mysql2`, MariaDB 10.5, SQLite, Node test runner, systemd, Bash.

## Global Constraints

- Database name is `nikai_ai` with `utf8mb4` encoding.
- Accounts are `nikai_app@localhost` and `nikai_owner@localhost` with independent random passwords.
- Port 3306 remains unavailable from the public internet.
- All 27 existing tables and rows migrate; production performs no post-cutover SQLite writes.
- Binary assets remain on disk and retain stable database URLs.
- The final SQLite snapshot and a MariaDB dump must both be restorable.

---

### Task 1: Common asynchronous database contract

**Files:**
- Create: `backend/database-adapters.mjs`
- Create: `tests/database-adapters.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: `openApplicationDatabase(options)`, `queryOne(sql, params)`, `queryAll(sql, params)`, `execute(sql, params)`, `transaction(callback)`, `close()`.

- [ ] Write adapter contract tests against a temporary SQLite database for one-row reads, multi-row reads, affected-row counts, rollback, and commit.
- [ ] Run `node --test tests/database-adapters.test.mjs` and confirm missing-module failure.
- [ ] Add `mysql2` and implement SQLite and MariaDB adapters with normalized result shapes.
- [ ] Run the focused adapter tests and confirm all pass.

### Task 2: MariaDB schema and SQL dialect

**Files:**
- Create: `backend/mariadb/schema.sql`
- Create: `backend/mariadb/migrations/001_initial.sql`
- Create: `backend/sql-dialect.mjs`
- Create: `tests/mariadb-schema.test.mjs`

**Interfaces:**
- Produces: complete 27-table MariaDB schema and dialect helpers for current timestamp, date windows, JSON extraction, ignore inserts, and upserts.

- [ ] Add tests that compare SQLite table/index/foreign-key intent with the MariaDB schema and exercise every dialect helper.
- [ ] Confirm tests fail because the schema and helpers do not exist.
- [ ] Translate all columns, defaults, unique keys, indexes, foreign keys, cascades, and migrations to MariaDB 10.5 syntax.
- [ ] Implement dialect helpers and run the focused tests.

### Task 3: Convert application database access to async

**Files:**
- Modify: `backend/database.mjs`
- Modify: `backend/auth.mjs`
- Modify: `backend/content-admin.mjs`
- Modify: `backend/monitoring.mjs`
- Modify: `backend/news-publisher.mjs`
- Modify: `backend/tool-import.mjs`
- Modify: `server.mjs`
- Modify: `scripts/import-official-catalog.mjs`
- Modify: `scripts/import-tool-catalog.mjs`
- Modify: `scripts/send-weekly-digest.mjs`
- Modify: affected tests under `tests/`

**Interfaces:**
- Consumes: the adapter contract and SQL dialect from Tasks 1–2.
- Produces: unchanged HTTP API behavior backed by awaited database operations.

- [ ] Add MariaDB-mode configuration and backend reporting assertions before changing implementation.
- [ ] Confirm the assertions fail against the SQLite-only application.
- [ ] Replace direct synchronous `prepare/exec` calls with common adapter methods and awaited transactions.
- [ ] Replace SQLite-only SQL expressions with dialect output while preserving response objects and errors.
- [ ] Run authentication, API, CMS, monitoring, import, and news-publisher tests, followed by `npm test`.

### Task 4: Deterministic SQLite-to-MariaDB migration

**Files:**
- Create: `scripts/migrate-sqlite-to-mariadb.mjs`
- Create: `scripts/verify-mariadb-migration.mjs`
- Create: `tests/mariadb-migration.test.mjs`

**Interfaces:**
- Migration consumes `--sqlite`, MariaDB environment variables, and `--reset-empty-target`.
- Verification produces JSON containing table counts, primary-key differences, critical aggregates, asset checks, and a pass/fail status.

- [ ] Write migration tests using a seeded SQLite fixture and a disposable MariaDB schema when connection settings are present; keep structural export tests runnable offline.
- [ ] Confirm the structural tests fail before the scripts exist.
- [ ] Implement foreign-key-safe batch import, explicit transaction rollback, count checks, primary-key checks, and selected SHA-256 row checks.
- [ ] Implement published local-asset existence verification without storing file bytes in MariaDB.
- [ ] Run offline tests and a disposable schema rehearsal on the server.

### Task 5: MariaDB backup and deployment operations

**Files:**
- Create: `scripts/backup-mariadb.sh`
- Create: `scripts/restore-mariadb.sh`
- Modify: `scripts/release-production.sh`
- Modify: `scripts/rollback-production.sh`
- Create: `tests/mariadb-operations.test.mjs`

**Interfaces:**
- Backup produces a gzip-compressed consistent dump plus SHA-256 sidecar.
- Restore requires an explicit dump path and verifies the checksum before import.

- [ ] Add tests for strict shell mode, credential-file use, dump flags, checksum verification, permissions, and retention.
- [ ] Confirm the tests fail before scripts exist.
- [ ] Implement backup, restore, release, and paired application/database rollback steps.
- [ ] Run shell syntax checks and operations tests.

### Task 6: Provision, rehearse, cut over, and verify production

**Files:**
- Create: `docs/deployment-mariadb-primary-20260916.md` without credentials.

**Interfaces:**
- Produces: live `nikai_ai`, two localhost accounts, production MariaDB environment, final SQLite snapshot, MariaDB dump, and rollback artifacts.

- [ ] Generate both credentials locally in memory, provision the database/accounts through the local MariaDB socket, and store the application secret in the protected environment file.
- [ ] Confirm MariaDB is bound locally and cloud/firewall rules do not expose 3306.
- [ ] Rehearse schema creation and migration in a disposable database while the live service stays on SQLite.
- [ ] Compare all table counts and critical API aggregates, then delete the disposable database.
- [ ] Run the complete local suite and build the reviewed release artifact.
- [ ] Stop the service, take the final SQLite backup, provision the empty production schema, migrate and verify, deploy code/config, and start the service.
- [ ] Verify health, articles, catalog, login/session, favorites, ratings, CMS write/revert, analytics ingestion, background publisher, asset routes, service status, and absence of SQLite WAL growth.
- [ ] Create and verify a MariaDB dump, document non-secret evidence, commit the deployment record, and provide both credentials directly to the user.
