#!/usr/bin/env bash
set -euo pipefail
if [[ $# -ne 1 ]]; then echo "Usage: $0 <dump.sql.gz>" >&2; exit 2; fi
dump="$1"
defaults_file="${NIKAI_MARIADB_DEFAULTS_FILE:-/opt/nikai-ai/.mariadb.cnf}"
database="${NIKAI_DB_NAME:-nikai_ai}"
test -f "$dump" && test -f "$dump.sha256"
sha256sum -c "$dump.sha256"
gzip -cd "$dump" | mariadb --defaults-extra-file="$defaults_file" --default-character-set=utf8mb4 "$database"
