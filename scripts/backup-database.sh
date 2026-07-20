#!/usr/bin/env bash
set -euo pipefail

DB_PATH="${NIKAI_DB_PATH:-/opt/nikai-ai/data/nikai-ai.sqlite}"
BACKUP_DIR="${NIKAI_BACKUP_DIR:-/opt/nikai-ai-backups/sqlite}"
RETENTION_DAYS="${NIKAI_BACKUP_RETENTION_DAYS:-30}"

if [[ ! -f "$DB_PATH" ]]; then
  echo "Database not found: $DB_PATH" >&2
  exit 1
fi

if [[ ! "$RETENTION_DAYS" =~ ^[1-9][0-9]*$ ]]; then
  echo "Invalid retention period: $RETENTION_DAYS" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
timestamp="$(date +%Y%m%d-%H%M%S)"
base_name="nikai-ai-${timestamp}.sqlite"
temp_db="$(mktemp "${BACKUP_DIR}/.${base_name}.XXXXXX")"
temp_gzip="${temp_db}.gz"

cleanup() {
  rm -f "$temp_db" "$temp_gzip"
}
trap cleanup EXIT

sqlite3 "$DB_PATH" ".timeout 10000" ".backup '$temp_db'"

integrity_result="$(sqlite3 "$temp_db" "PRAGMA quick_check;")"
if [[ "$integrity_result" != "ok" ]]; then
  echo "Backup integrity check failed: $integrity_result" >&2
  exit 1
fi

gzip -9 -c "$temp_db" > "$temp_gzip"
final_gzip="${BACKUP_DIR}/${base_name}.gz"
mv "$temp_gzip" "$final_gzip"
sha256sum "$final_gzip" > "${final_gzip}.sha256"

retention_minutes="$((RETENTION_DAYS * 1440))"
find "$BACKUP_DIR" -maxdepth 1 -type f \
  \( -name 'nikai-ai-*.sqlite.gz' -o -name 'nikai-ai-*.sqlite.gz.sha256' \) \
  -mmin "+${retention_minutes}" -delete

echo "Backup completed: $final_gzip"

