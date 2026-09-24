#!/usr/bin/env bash
set -euo pipefail
if [[ $# -ne 1 ]]; then echo "Usage: $0 <dump.sql.gz>" >&2; exit 2; fi
dump="$1"
defaults_file="${NIKAI_MARIADB_DEFAULTS_FILE:-/opt/nikai-ai/.mariadb.cnf}"
database="${NIKAI_DB_NAME:-nikai_ai}"
test -f "$dump" && test -f "$dump.sha256"
expected_checksum="$(<"$dump.sha256")"
# Older backups use sha256sum's '<digest>  <filename>' (or binary '*') form.
# Only take its digest: the supplied dump remains the sole import/checksum target.
legacy_pattern='^([[:xdigit:]]{64}) [ *].+$'
if [[ "$expected_checksum" != *$'\n'* && "$expected_checksum" =~ $legacy_pattern ]]; then
  expected_checksum="${BASH_REMATCH[1]}"
fi
if ! [[ "$expected_checksum" =~ ^[[:xdigit:]]{64}$ ]]; then echo "Invalid SHA-256 sidecar: $dump.sha256" >&2; exit 2; fi
actual_checksum="$(sha256sum "$dump" | awk '{print $1}')"
if [[ "${actual_checksum,,}" != "${expected_checksum,,}" ]]; then echo "Checksum mismatch: $dump" >&2; exit 1; fi
gzip -cd "$dump" | mariadb --defaults-extra-file="$defaults_file" --default-character-set=utf8mb4 "$database"
