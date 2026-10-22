#!/usr/bin/env bash
set -euo pipefail

export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"
app_dir="${NIKAI_RELEASE_APP_DIR:-/opt/nikai-ai}"
snapshot_dir="${NIKAI_RELEASE_SNAPSHOT_DIR:-/opt/nikai-ai-backups/releases}"
log_file="${snapshot_dir}/release-history.log"
ready_url="${NIKAI_RELEASE_READY_URL:-http://127.0.0.1:4174/api/v1/health/ready}"
service_ctl="${NIKAI_RELEASE_SERVICE_CMD:-systemctl}"
mkdir -p "$snapshot_dir"
exec 9>"${snapshot_dir}/.release.lock"
flock -n 9 || { echo "Another release is running" >&2; exit 1; }
previous="${1:-$(find "$snapshot_dir" -maxdepth 1 -type d -name 'previous-*' -printf '%T@ %p\n' | sort -nr | head -1 | cut -d' ' -f2-)}"
replaced="${snapshot_dir}/replaced-$(date +%Y%m%d-%H%M%S)-$$"

if [[ ! -d "$previous" || "$(realpath -e "$previous")" != "$snapshot_dir"/previous-* ]]; then
  echo "A complete previous-* release directory is required; legacy .tgz snapshots need a reviewed restore" >&2
  exit 1
fi
test -f "$previous/server.mjs"
test -d "$previous/node_modules"
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
    "$service_ctl" stop nikai-ai.service
    mv "$app_dir" "$previous"
    chmod 0700 "$previous"
    mv "$replaced" "$app_dir"
    chmod 0755 "$app_dir"
    "$service_ctl" start nikai-ai.service
    wait_ready
  elif [[ "$phase" == "moved_current" ]]; then
    mv "$replaced" "$app_dir"
    chmod 0755 "$app_dir"
    "$service_ctl" start nikai-ai.service
    wait_ready
  elif [[ "$phase" == "stopped" ]]; then
    "$service_ctl" start nikai-ai.service
    wait_ready
  fi
  printf '%s\tmanual-rollback\tfailed\t%s\n' "$(date --iso-8601=seconds)" "$previous" >> "$log_file"
  echo "Rollback failed; current service restoration attempted" >&2
  exit "$status"
}
trap 'rollback_failed $?' ERR
trap 'rollback_failed 130' INT TERM

node "$app_dir/scripts/active-database-backup.mjs" "$app_dir"
phase="stopped"
"$service_ctl" stop nikai-ai.service
cp -a "$app_dir/.env" "$previous/.env"
if [[ -f "$app_dir/.mariadb.cnf" ]]; then cp -a "$app_dir/.mariadb.cnf" "$previous/.mariadb.cnf"; fi
for directory in data imports; do
  if [[ -d "$app_dir/$directory" ]]; then
    mkdir -p "$previous/$directory"
    cp -a "$app_dir/$directory/." "$previous/$directory/"
  fi
done
old_logo_dir="$app_dir/public/assets/tool-logos"
if [[ ! -d "$old_logo_dir" ]]; then old_logo_dir="$app_dir/assets/tool-logos"; fi
if [[ -d "$old_logo_dir" ]]; then
  if [[ -d "$previous/public" ]]; then logo_target="$previous/public/assets/tool-logos"; else logo_target="$previous/assets/tool-logos"; fi
  mkdir -p "$logo_target"
  cp -an "$old_logo_dir/." "$logo_target/"
fi
phase="moved_current"
mv "$app_dir" "$replaced"
chmod 0700 "$replaced"
mv "$previous" "$app_dir"
phase="switched"
chmod 0755 "$app_dir"
"$service_ctl" start nikai-ai.service
wait_ready

printf '%s\tmanual-rollback\tsuccess\t%s\n' "$(date --iso-8601=seconds)" "$replaced" >> "$log_file"
trap - ERR INT TERM
echo "Rollback completed: $previous"
