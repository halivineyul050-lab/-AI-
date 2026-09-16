# Obsidian News Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean 69 Obsidian公众号 drafts, remove all image/editorial residue, and publish them as image-free news articles in the production MariaDB database.

**Architecture:** A deterministic Node.js cleaner parses front matter and Markdown into normalized article records, then emits a JSON review artifact. A separate MariaDB importer validates the artifact, backs up/upserts in one transaction, and verifies production through database and HTTP checks.

**Tech Stack:** Node.js 22 ESM, Node test runner, Markdown text processing, `mysql2`, MariaDB 10.5, Bash/SSH deployment helpers.

## Global Constraints

- Scan only root-level Markdown files from `D:\Users\zhanglian2\Documents\Obsidian Vault\公众号日更包\公众号——张练`.
- Exclude four files whose title contains `资讯选题池与待确认线索`.
- Produce exactly 69 published `news` records with empty `cover_url`.
- Preserve supported facts and author voice; remove front matter, image instructions, image syntax, editorial scaffolding, and公众号-only calls to action.
- Use stable IDs/slugs and upsert without duplicates.
- Back up and checksum production MariaDB before import.

---

### Task 1: Deterministic draft cleaner

**Files:**
- Create: `scripts/obsidian-news-cleaner.mjs`
- Create: `tests/obsidian-news-cleaner.test.mjs`

**Interfaces:**
- Produces: `parseDraft(markdown, filename)`, `cleanBody(body)`, `buildArticle(markdown, filename)`, and `buildImport(sourceDir)`.

- [ ] Write fixtures that include front matter, duplicate H1, alternative titles, image blockquotes, Markdown images, HTML images, editorial headings, a source list, and a公众号 footer.
- [ ] Run `node --test tests/obsidian-news-cleaner.test.mjs` and confirm the missing module failure.
- [ ] Implement metadata parsing, stable identifiers, conservative cleanup, excerpt generation, reading time, source mapping, and root-only file selection.
- [ ] Run the focused tests and confirm the fixture is image-free while its factual paragraphs and source link remain.
- [ ] Commit the cleaner and tests.

### Task 2: Generate and review all 69 records

**Files:**
- Generate: `output/obsidian-news-import-20260916.json`
- Generate: `output/obsidian-news-review-20260916.md`

**Interfaces:**
- Consumes: `buildImport(sourceDir)`.
- Produces: 69 normalized article records and a human-readable anomaly report.

- [ ] Run the cleaner against the specified directory.
- [ ] Assert exact count 69, unique IDs/slugs/titles, nonempty title/body/date, empty covers, and no image/editorial marker patterns.
- [ ] Inspect all titles plus the beginning/end of every cleaned article; correct false positives and residual draft text in the cleaner.
- [ ] Regenerate artifacts and repeat the full validation until the anomaly count is zero.

### Task 3: Transactional MariaDB importer

**Files:**
- Create: `scripts/import-obsidian-news.mjs`
- Create: `tests/import-obsidian-news.test.mjs`

**Interfaces:**
- Consumes: normalized JSON plus `NIKAI_DB_*` connection settings.
- Produces: pre-import snapshot rows and one-transaction title/slug-aware upserts.

- [ ] Write tests for artifact validation, duplicate rejection, empty-cover enforcement, and upsert planning.
- [ ] Confirm tests fail before the importer exists.
- [ ] Implement dry-run validation, existing-row matching by ID/slug/title, transaction rollback, and import summary output.
- [ ] Run focused tests and the complete local suite.
- [ ] Commit importer code and tests.

### Task 4: Backup, publish, and verify production

**Files:**
- Create: `docs/deployment-obsidian-news-20260916.md`

**Interfaces:**
- Consumes: reviewed JSON and protected server credentials.
- Produces: production backup, 69 inserted/updated articles, and verification evidence.

- [ ] Upload the reviewed artifact and importer without credentials in either file.
- [ ] Run `/opt/nikai-ai/scripts/backup-mariadb.sh` and verify its SHA-256 sidecar.
- [ ] Run importer dry-run, then transactional apply with the owner account.
- [ ] Query all 69 IDs and assert `kind='news'`, `status='published'`, empty `cover_url`, unique slugs, and image-free bodies.
- [ ] Verify the public news API and service readiness.
- [ ] Record counts, backup path, and verification evidence without secrets; commit the deployment record.
