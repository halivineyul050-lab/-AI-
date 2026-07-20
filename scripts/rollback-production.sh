#!/usr/bin/env bash
set -euo pipefail

app_dir="/opt/nikai-ai"
snapshot_dir="/opt/nikai-ai-backups/releases"
snapshot="${1:-$(find "$snapshot_dir" -maxdepth 1 -name 'release-*.tgz' -type f -printf '%T@ %p\n' | sort -nr | head -1 | cut -d' ' -f2-)}"

if [[ -z "$snapshot" || ! -f "$snapshot" ]]; then
  echo "No release snapshot available" >&2
  exit 1
fi

"${app_dir}/scripts/backup-database.sh"
systemctl stop nikai-ai.service
tar -xzf "$snapshot" -C "$app_dir"
chown root:nikai "$app_dir/scripts/release-production.sh" "$app_dir/scripts/rollback-production.sh"
chmod 0750 "$app_dir/scripts/release-production.sh" "$app_dir/scripts/rollback-production.sh"
systemctl start nikai-ai.service

for attempt in {1..15}; do
  if curl --fail --silent http://127.0.0.1:4174/api/v1/health/ready >/dev/null; then
    printf '%s\tmanual-rollback\tsuccess\t%s\n' "$(date --iso-8601=seconds)" "$snapshot" >> "${snapshot_dir}/release-history.log"
    echo "Rollback completed: $snapshot"
    exit 0
  fi
  sleep 2
done

echo "Rollback health check failed" >&2
exit 1
