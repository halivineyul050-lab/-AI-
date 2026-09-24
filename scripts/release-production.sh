#!/usr/bin/env bash
set -euo pipefail

# sudo's secure_path can omit the Node installation used by the service.
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

archive="${1:-}"
release_id="${2:-manual-$(date +%Y%m%d-%H%M%S)}"
app_dir="${NIKAI_RELEASE_APP_DIR:-/opt/nikai-ai}"
snapshot_dir="${NIKAI_RELEASE_SNAPSHOT_DIR:-/opt/nikai-ai-backups/releases}"
log_file="${snapshot_dir}/release-history.log"
ready_url="${NIKAI_RELEASE_READY_URL:-http://127.0.0.1:4174/api/v1/health/ready}"
service_ctl="${NIKAI_RELEASE_SERVICE_CMD:-systemctl}"

if [[ ! -f "$archive" || ! "$release_id" =~ ^[A-Za-z0-9._-]{1,64}$ ]]; then
  echo "A release archive and a safe release ID are required" >&2
  exit 1
fi
archive="$(realpath -e "$archive")"
mkdir -p "$snapshot_dir"
exec 9>"${snapshot_dir}/.release.lock"
flock -n 9 || { echo "Another release is running" >&2; exit 1; }

timestamp="$(date +%Y%m%d-%H%M%S)"
stage="$(mktemp -d "${snapshot_dir}/.stage-${release_id}.XXXXXX")"
previous="${snapshot_dir}/previous-${timestamp}-${release_id}"
failed="${snapshot_dir}/failed-${timestamp}-${release_id}"
snapshot="${snapshot_dir}/release-${timestamp}-${release_id:0:12}.tgz"
phase="preflight"

ready() {
  curl --fail --silent --show-error "$ready_url" | grep -q '"database":true'
}

wait_ready() {
  for attempt in {1..15}; do
    if ready; then return 0; fi
    sleep 2
  done
  return 1
}

release_failed() {
  local status="$1" rollback_status="failed_preflight"
  trap - ERR INT TERM
  set +e
  echo "Release failed during ${phase}; restoring the previous service" >&2
  if [[ "$phase" == "switched" ]]; then
    "$service_ctl" stop nikai-ai.service
    mv "$app_dir" "$failed"
    chmod 0700 "$failed"
    mv "$previous" "$app_dir"
    chmod 0755 "$app_dir"
    "$service_ctl" start nikai-ai.service
    if wait_ready; then rollback_status="failed_rolled_back"; else rollback_status="failed_rollback_unhealthy"; fi
  elif [[ "$phase" == "moved_old" ]]; then
    if [[ -d "$previous" ]]; then mv "$previous" "$app_dir"; fi
    chmod 0755 "$app_dir"
    "$service_ctl" start nikai-ai.service
    if wait_ready; then rollback_status="failed_rolled_back"; else rollback_status="failed_rollback_unhealthy"; fi
  elif [[ "$phase" == "stopped" ]]; then
    "$service_ctl" start nikai-ai.service
    if wait_ready; then rollback_status="failed_pre_switch"; else rollback_status="failed_rollback_unhealthy"; fi
  fi
  if [[ -d "$stage" && "$stage" == "$snapshot_dir"/.stage-* ]]; then rm -rf -- "$stage"; fi
  printf '%s\t%s\t%s\t%s\n' "$(date --iso-8601=seconds)" "$release_id" "$rollback_status" "$snapshot" >> "$log_file"
  exit "$status"
}
trap 'release_failed $?' ERR
trap 'release_failed 130' INT TERM

# The archive is tested in a clean tree. Old tests and files in /opt/nikai-ai
# cannot contaminate this run or be served to visitors during preflight.
tar -xzf "$archive" -C "$stage"
test -f "$stage/package-lock.json"
test -f "$stage/scripts/active-database-backup.mjs"
test -f "$stage/scripts/apply-production-migrations.mjs"
(
  cd "$stage"
  npm ci
  node --check server.mjs
  npm test
)

# A database dump and a code archive exist before any schema or live-file change.
node "$stage/scripts/active-database-backup.mjs" "$app_dir"
tar --exclude='./data' --exclude='./.env*' --exclude='./.mariadb.cnf*' --exclude='./node_modules' --exclude='./imports' --exclude='./.git' -czf "$snapshot" -C "$app_dir" .
node --env-file="$app_dir/.env" "$stage/scripts/apply-production-migrations.mjs" "$stage" "$app_dir"

# Stop writes, carry forward server-only state, then swap complete directories.
phase="stopped"
"$service_ctl" stop nikai-ai.service
cp -a "$app_dir/.env" "$stage/.env"
if [[ -f "$app_dir/.mariadb.cnf" ]]; then cp -a "$app_dir/.mariadb.cnf" "$stage/.mariadb.cnf"; fi
for directory in data imports; do
  if [[ -d "$app_dir/$directory" ]]; then
    mkdir -p "$stage/$directory"
    if [[ "$directory" == "imports" ]]; then cp -an "$app_dir/$directory/." "$stage/$directory/";
    else cp -a "$app_dir/$directory/." "$stage/$directory/"; fi
  fi
done
if [[ -d "$app_dir/assets/tool-logos" ]]; then
  mkdir -p "$stage/assets/tool-logos"
  cp -an "$app_dir/assets/tool-logos/." "$stage/assets/tool-logos/"
fi
chown root:nikai "$stage/scripts/release-production.sh" "$stage/scripts/rollback-production.sh"
chmod 0750 "$stage/scripts/release-production.sh" "$stage/scripts/rollback-production.sh"
chmod 0755 "$stage"
phase="moved_old"
mv "$app_dir" "$previous"
chmod 0700 "$previous"
mv "$stage" "$app_dir"
phase="switched"
"$service_ctl" start nikai-ai.service
wait_ready

printf '%s\t%s\tsuccess\t%s\n' "$(date --iso-8601=seconds)" "$release_id" "$previous" >> "$log_file"
rm -f "$archive"
trap - ERR INT TERM
echo "Release completed: $release_id"
