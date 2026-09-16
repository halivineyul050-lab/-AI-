# MariaDB Primary Database Migration Design

## Objective

Replace the production SQLite database with the server's existing MariaDB 10.5 service. Migrate every relational table and row, including articles, tools, categories, users, sessions, favorites, ratings, submissions, subscriptions, audit data, and analytics. New production writes must go only to MariaDB after cutover.

## Accounts and network boundary

- Database: `nikai_ai`, UTF-8 `utf8mb4`.
- Application account: `nikai_app@localhost`, limited to the privileges the application needs on `nikai_ai`.
- Owner account: `nikai_owner@localhost`, full privileges on `nikai_ai` without global administration or `GRANT OPTION`.
- Generate independent cryptographically random passwords during provisioning.
- Store the application connection settings only in `/opt/nikai-ai/.env`, owned by root/nikai with mode `640` or stricter.
- Do not expose TCP port 3306 publicly. Owner access uses SSH followed by a local MariaDB connection or SSH tunnel.
- Return both generated credentials to the user once provisioning and verification finish. Never commit them or write them to deployment documentation.

## Application architecture

Introduce an asynchronous database interface backed by a MariaDB connection pool in production. Route handlers, authentication, content administration, monitoring, news publishing, and maintenance scripts must await database operations and transactions. Keep a SQLite adapter for isolated automated tests until the MariaDB test suite can run in CI without relying on the production server.

The MariaDB schema is maintained as versioned SQL migrations. Convert SQLite-specific constructs including `PRAGMA`, `strftime`, `date`, `ON CONFLICT`, `INSERT OR IGNORE`, JSON extraction, and immediate transactions to MariaDB equivalents. Preserve API response shapes, timestamp strings, unique constraints, foreign keys, cascading deletes, and idempotency behavior.

## Data migration and cutover

1. Create verified SQLite and application snapshots before any write.
2. Create the database, accounts, schema, and least-privilege grants.
3. Export a consistent SQLite snapshot and load every table in foreign-key-safe order.
4. Compare table counts, primary-key sets, null counts, selected checksums, and critical API aggregates between SQLite and MariaDB.
5. Deploy MariaDB-capable application code while the service is stopped for the final snapshot/import, preventing writes during the cutover window.
6. Start the service with MariaDB settings and run health, read, write, authentication, CMS, and rollback smoke tests.
7. Retain the final SQLite database as a read-only rollback artifact. Rollback restores the previous application release and SQLite environment variables together.

## Files and other resources

Binary assets remain in `/opt/nikai-ai/assets` and other existing managed directories. Database rows continue to store their stable URLs and metadata. The migration backs up these directories and verifies that every database-referenced local asset exists; it does not store large files as database BLOBs.

## Backup and operations

Replace production database backup jobs with compressed `mariadb-dump` backups, SHA-256 sidecars, retention pruning, and a restore-verification procedure. Health and monitoring endpoints report the MariaDB backend, connection readiness, schema version, and pool state without exposing credentials.

## Acceptance criteria

- All 27 existing relational tables and every row are present in MariaDB.
- Critical per-table counts match the final SQLite snapshot exactly.
- Production uses `nikai_app` and writes no new data to SQLite.
- Article, catalog, account, CMS, analytics, newsletter, and background-publisher workflows pass.
- Local assets referenced by published tools remain reachable.
- A tested SQLite rollback artifact and MariaDB dump both exist.
- MariaDB is not reachable from the public internet.
