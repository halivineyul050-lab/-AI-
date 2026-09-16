#!/usr/bin/env bash
set -euo pipefail
backup_dir="${NIKAI_MARIADB_BACKUP_DIR:-/opt/nikai-ai-backups/mariadb}"
defaults_file="${NIKAI_MARIADB_DEFAULTS_FILE:-/opt/nikai-ai/.mariadb.cnf}"
database="${NIKAI_DB_NAME:-nikai_ai}"
retention_days="${NIKAI_BACKUP_RETENTION_DAYS:-30}"
timestamp="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
target="$backup_dir/nikai-ai-$timestamp.sql.gz"
umask 077
mariadb-dump --defaults-extra-file="$defaults_file" --single-transaction --routines --triggers --events --hex-blob --default-character-set=utf8mb4 "$database" | gzip -9 > "$target"
sha256sum "$target" > "$target.sha256"
find "$backup_dir" -type f \( -name 'nikai-ai-*.sql.gz' -o -name 'nikai-ai-*.sql.gz.sha256' \) -mtime "+$retention_days" -delete
echo "$target"
