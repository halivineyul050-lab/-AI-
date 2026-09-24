# Production release procedure

This is the release runbook for the current production deployment: one Node.js service behind Nginx, with MariaDB 10.5. Local development and automated tests use SQLite by default. Production runs with `NIKAI_DB_ENGINE=mariadb`.

## 1. Review the release source

Start from the intended Git commit. Check `git status --short`, `git log -1 --oneline`, and the diff. Never package `.env`, database files, backups, `node_modules`, imports, or unrelated uncommitted files. The repository's `main` workflow currently builds an archive from the checked-out workspace after running tests; review the exact commit and workflow before triggering it.

## 2. Verify locally

Use Node.js 22.5 or later:

```powershell
npm test
npm run logos:verify
```

Confirm the production environment has `NIKAI_DB_ENGINE=mariadb`, valid MariaDB credentials/socket, a stable `NIKE_ANALYTICS_SALT`, and the exact `NIKE_IMAGE_CONFIG_KEY` if image providers are configured. Keep the `.env` file server-side with restricted permissions. Store a recovery copy of the image master key separately from the database backups.

## 3. Trigger the deployment

The supported automated path is GitHub Actions workflow **Deploy production**, triggered by a reviewed push to `main` or `workflow_dispatch`. It requires:

- `PRODUCTION_SSH_USER`
- `PRODUCTION_SSH_PRIVATE_KEY`
- optionally `PRODUCTION_SSH_HOST` (the workflow currently has a default host)

The workflow runs `npm test`, archives the checked-out project, uploads the archive over SSH, and invokes `/opt/nikai-ai/scripts/release-production.sh` on the server. Never copy SSH credentials into chat, shell history, repository files, or an archive.

For a controlled manual run, use the same reviewed archive and server release script through an approved SSH account. Do not edit the live site directly or upload a developer working directory wholesale.

## 4. What the server release script does

The release script:

1. Extract the backup selector from the incoming archive to a temporary directory, then back up the active database backend before changing code (`scripts/active-database-backup.mjs` selects MariaDB or SQLite from `NIKAI_DB_ENGINE`). This supports the first release that introduces the selector.
2. Save a code snapshot while excluding `.env`, database data, dependencies, and imports.
3. Extract the release, run a syntax check and the full tests, restart `nikai-ai.service`, and poll the local ready check.
4. Restore the code snapshot and restart the service if a step fails.

The database backup helper and the updated release/rollback scripts are part of the local audit changes. They are not live until included in a successful release. The currently installed server release script was verified as SQLite-only, so this code must be deployed before relying on automatic MariaDB pre-release backups.

Code rollback does not roll back MariaDB migrations or user content. Restore a database dump only as a separate, deliberate recovery operation after checking its timestamp and checksum.

## 5. Verify production

After the workflow reports success, check:

```text
https://ontimo.cn/api/v1/health/live
https://ontimo.cn/api/v1/health/ready
https://ontimo.cn/api/v1/site/bootstrap
https://ontimo.cn/api/v1/site-announcements
```

Health endpoints should return HTTP 200 and `data.status: "ok"`. Also open the home page, articles, tool detail and outbound link, announcement dialog, image generation, login, and operations dashboard. Verify that an unauthenticated request cannot read administrative data and that the user-facing pages still load.

Check `/opt/nikai-ai-backups/releases/release-history.log` and the MariaDB backup directory for the new release record and a fresh database dump. Do not place API keys or admin tokens in screenshots or logs.

## Recovery notes

- Database backups contain encrypted provider API keys; `NIKE_IMAGE_CONFIG_KEY` is required to decrypt them.
- A missing image master key means provider API keys must be entered again after restoring the database.
- Keep code snapshots and database backups as separate recovery artifacts.
- The live site uses database content; do not seed or overwrite production content with a local database snapshot.
