#!/usr/bin/env bash
set -euo pipefail

export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"
app_dir="/opt/nikai-ai"
snapshot_dir="/opt/nikai-ai-backups/releases"
ready_url="http://127.0.0.1:4174/api/v1/health/ready"
previous="${1:-$(find "$snapshot_dir" -maxdepth 1 -type d -name 'previous-*' -printf '%T@ %p\n' | sort -nr | head -1 | cut -d' ' -f2-)}"
replaced="${snapshot_dir}/replaced-$(date +%Y%m%d-%H%M%S)-$$"

if [[ ! -d "$previous" || "$(realpath -e "$previous")" != "$snapshot_dir"/previous-* ]]; then
  echo "A complete previous-* release directory is required; legacy .tgz snapshots need a reviewed restore" >&2
  exit 1
fi
test -f "$previous/server.mjs"
test -d "$previous/node_modules"
exec 9>"${snapshot_dir}/.release.lock"
flock -n 9 || { echo "Another release is running" >&2; exit 1; }

wait_ready() {
  for attempt in {1..15}; do
    if curl --fail --silent --show-error "$ready_url" | grep -q '"database":true'; then return 0; fi
    sleep 2
  done
  return 1
}

phase="preflight"
rollback_failed() {
  local status="$1"
  trap - ERR INT TERM
  set +e
  if [[ "$phase" == "switched" ]]; then
    systemctl stop nikai-ai.service
    mv "$app_dir" "$previous"
    chmod 0700 "$previous"
    mv "$replaced" "$app_dir"
    chmod 0755 "$app_dir"
    systemctl start nikai-ai.service
    wait_ready
  elif [[ "$phase" == "moved_current" ]]; then
    mv "$replaced" "$app_dir"
    chmod 0755 "$app_dir"
    systemctl start nikai-ai.service
    wait_ready
  elif [[ "$phase" == "stopped" ]]; then
    systemctl start nikai-ai.service
    wait_ready
  fi
  echo "Rollback failed; current service restoration attempted" >&2
  exit "$status"
}
trap 'rollback_failed $?' ERR
trap 'rollback_failed 130' INT TERM

node "$app_dir/scripts/active-database-backup.mjs" "$app_dir"
phase="stopped"
systemctl stop nikai-ai.service
cp -a "$app_dir/.env" "$previous/.env"
if [[ -f "$app_dir/.mariadb.cnf" ]]; then cp -a "$app_dir/.mariadb.cnf" "$previous/.mariadb.cnf"; fi
for directory in data imports; do
  if [[ -d "$app_dir/$directory" ]]; then
    mkdir -p "$previous/$directory"
    cp -a "$app_dir/$directory/." "$previous/$directory/"
  fi
done
if [[ -d "$app_dir/assets/tool-logos" ]]; then
  mkdir -p "$previous/assets/tool-logos"
  cp -an "$app_dir/assets/tool-logos/." "$previous/assets/tool-logos/"
fi
phase="moved_current"
mv "$app_dir" "$replaced"
chmod 0700 "$replaced"
mv "$previous" "$app_dir"
phase="switched"
chmod 0755 "$app_dir"
systemctl start nikai-ai.service
wait_ready

printf '%s\tmanual-rollback\tsuccess\t%s\n' "$(date --iso-8601=seconds)" "$replaced" >> "${snapshot_dir}/release-history.log"
trap - ERR INT TERM
echo "Rollback completed: $previous"
