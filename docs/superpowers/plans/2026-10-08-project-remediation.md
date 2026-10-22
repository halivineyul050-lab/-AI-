# Project Remediation Implementation Plan

**Goal:** Restore reliable daily backups, protect deployed code, and resolve the remaining verified audit findings without publishing unrelated workspace changes.

**Architecture:** Use the existing production release script as the sole deployment entry. A staged operations migration will normalize archive permissions and install a narrowly scoped systemd backup override before the directory switch. Later changes to application limits and CI remain separate, reviewable steps.

**Tech Stack:** Node.js 22, Bash, systemd, MariaDB, Node test runner.

## Global Constraints

- Build every release from the current complete production version; overlay only reviewed files.
- Keep `.env`, `.mariadb.cnf`, database dumps, user content, and `node_modules` outside the release package.
- Never print credentials or edit `/opt/nikai-ai` directly.
- Run full clean-tree tests and use `/opt/nikai-ai/scripts/release-production.sh` for production switching.

### Task 1: Repair backup timer and stage permissions

- [x] Add failing tests for stage permission normalization and the MariaDB systemd override.
- [x] Implement a staged operations migration and wire it to the existing migration entry point.
- [x] Run focused tests, full tests, syntax checks, and package inspection.
- [x] Release from the current production base; verify backup service success, checksum, file permissions, and public health.

### Task 2: Reconcile local test baseline

- [x] Update the stale admin layout assertion to verify the shared focus style actually loaded by the page.
- [x] Run the local suite and record any remaining failures without publishing the dirty checkout.

### Task 3: Bound in-memory and persistent growth

- [x] Add a failing high-cardinality rate limiter test, then bound stale map entries.
- [x] Define and test a non-destructive cloud image history quota or admission limit; keep existing images intact.
- [x] Run relevant suites and publish only reviewed files from a fresh production base.

### Task 4: CI and upstream generation

- [x] Update the CI workflow source to cover direct main pushes; remote GitHub activation remains pending repository reconciliation.
- [ ] Recheck image generation against the provider with a bounded request; do not retry billable requests automatically.
- [ ] Document any provider-side limitation that cannot be resolved in this application.
