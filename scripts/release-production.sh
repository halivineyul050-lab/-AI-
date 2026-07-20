#!/usr/bin/env bash
set -euo pipefail

archive="${1:-}"
release_id="${2:-manual-$(date +%Y%m%d-%H%M%S)}"
app_dir="/opt/nikai-ai"
snapshot_dir="/opt/nikai-ai-backups/releases"
log_file="${snapshot_dir}/release-history.log"

if [[ ! -f "$archive" ]]; then
  echo "Release archive not found: $archive" >&2
  exit 1
fi

mkdir -p "$snapshot_dir"
timestamp="$(date +%Y%m%d-%H%M%S)"
snapshot="${snapshot_dir}/release-${timestamp}-${release_id:0:12}.tgz"

"${app_dir}/scripts/backup-database.sh"
tar --exclude='./data' --exclude='./.env' --exclude='./node_modules' --exclude='./imports' --exclude='./.git' -czf "$snapshot" -C "$app_dir" .

rollback() {
  echo "Release failed, restoring $snapshot" >&2
  tar -xzf "$snapshot" -C "$app_dir"
  systemctl restart nikai-ai.service
  printf '%s\t%s\tfailed_rolled_back\t%s\n' "$(date --iso-8601=seconds)" "$release_id" "$snapshot" >> "$log_file"
}
trap rollback ERR

tar -xzf "$archive" -C "$app_dir"
chown root:nikai "$app_dir/scripts/release-production.sh" "$app_dir/scripts/rollback-production.sh"
chmod 0750 "$app_dir/scripts/release-production.sh" "$app_dir/scripts/rollback-production.sh"
cd "$app_dir"
node --check server.mjs
npm test
systemctl restart nikai-ai.service
for attempt in {1..15}; do
  if curl --fail --silent http://127.0.0.1:4174/api/v1/health/ready >/dev/null; then
    printf '%s\t%s\tsuccess\t%s\n' "$(date --iso-8601=seconds)" "$release_id" "$snapshot" >> "$log_file"
    rm -f "$archive"
    find "$snapshot_dir" -maxdepth 1 -name 'release-*.tgz' -type f -mtime +30 -delete
    trap - ERR
    echo "Release completed: $release_id"
    exit 0
  fi
  sleep 2
done
exit 1
