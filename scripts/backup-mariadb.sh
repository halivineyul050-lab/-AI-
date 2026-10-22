#!/usr/bin/env bash
set -euo pipefail
backup_dir="${NIKAI_MARIADB_BACKUP_DIR:-/opt/nikai-ai-backups/mariadb}"
defaults_file="${NIKAI_MARIADB_DEFAULTS_FILE:-/opt/nikai-ai/.mariadb.cnf}"
database="${NIKAI_DB_NAME:-nikai_ai}"
retention_days="${NIKAI_BACKUP_RETENTION_DAYS:-30}"
timestamp="$(date +%Y%m%d-%H%M%S)-$$"
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
target="$backup_dir/nikai-ai-$timestamp.sql.gz"
partial="$target.partial"
checksum_partial="$target.sha256.partial"
umask 077
cleanup() {
  rm -f -- "$partial" "$checksum_partial"
  if [[ -f "$target" && ! -f "$target.sha256" ]]; then rm -f -- "$target"; fi
}
trap cleanup EXIT
mariadb-dump --defaults-extra-file="$defaults_file" --single-transaction --routines --triggers --events --hex-blob --skip-extended-insert --default-character-set=utf8mb4 "$database" | gzip -9 > "$partial"
sha256sum "$partial" | awk '{print $1}' > "$checksum_partial"
mv -- "$partial" "$target"
mv -- "$checksum_partial" "$target.sha256"
trap - EXIT
find "$backup_dir" -type f \( -name 'nikai-ai-*.sql.gz' -o -name 'nikai-ai-*.sql.gz.sha256' \) -mtime "+$retention_days" -delete
echo "$target"
