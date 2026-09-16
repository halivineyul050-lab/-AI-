# MariaDB Primary Deployment — 2026-09-16

## Result

Production now uses MariaDB 10.5 as its only relational write database. The application reports `backend=mariadb`; the retained SQLite file is a rollback snapshot and did not change during post-cutover read/write verification.

## Topology

- Database: `nikai_ai`, `utf8mb4_unicode_ci`
- Application account: `nikai_app@localhost` with `SELECT`, `INSERT`, `UPDATE`, and `DELETE`
- Owner account: `nikai_owner@localhost` with schema administration privileges
- Network: MariaDB listens only on `127.0.0.1:3306`
- Assets: binary files remain under the application filesystem; relational metadata and stable paths are stored in MariaDB
- Runtime: the application retains its synchronous repository interface through a dedicated MariaDB worker thread

Credentials are intentionally excluded from the repository. The application password is stored in `/opt/nikai-ai/.env`; owner credentials are stored in `/opt/nikai-ai/.mariadb.cnf`. Both files inherit protected server permissions.

## Migration Evidence

- Final SQLite snapshot: `/opt/nikai-ai-backups/sqlite-final/nikai-ai-20260916-152151.sqlite`
- Migrated tables: 27 of 27
- All source and target row counts matched
- Critical counts at cutover: 120 articles, 6,332 tools, 4 users, 1,729 analytics events
- Post-cutover checks covered application startup, readiness, article and tool reads, newsletter upsert, feedback write, analytics write, monitoring aggregation, cleanup, and backend reporting
- The retained SQLite file had identical modification time and size before and after post-cutover traffic

## Backup and Recovery

- Verified MariaDB dump: `/opt/nikai-ai-backups/mariadb/nikai-ai-20260916-152848.sql.gz`
- Checksum sidecar: `/opt/nikai-ai-backups/mariadb/nikai-ai-20260916-152848.sql.gz.sha256`
- Backup command: `NIKAI_DB_NAME=nikai_ai /opt/nikai-ai/scripts/backup-mariadb.sh`
- Restore command: `NIKAI_DB_NAME=nikai_ai /opt/nikai-ai/scripts/restore-mariadb.sh <dump.sql.gz>`
- Restore was rehearsed against a disposable database and reproduced all 6,332 tool records

## Rollback Artifacts

- Pre-cutover application snapshot: `/opt/nikai-ai-backups/releases/release-20260916-152151-mariadb-precutover.tgz`
- Pre-cutover environment snapshot: `/opt/nikai-ai-backups/releases/env-20260916-152151-mariadb-precutover`
- Final SQLite snapshot is listed above

Rollback restores the application and environment snapshots together, then starts the service on the final SQLite snapshot. MariaDB remains intact for diagnosis unless an explicit database restore is required.
