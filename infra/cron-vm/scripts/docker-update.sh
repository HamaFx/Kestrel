#!/usr/bin/env bash
# infra/cron-vm/scripts/docker-update.sh — Self-update via git pull + Docker build.
#
# Runs every 5 minutes via kestrel-update.timer. Compares the local
# checkout's HEAD to origin/main; if they differ:
#   1. git reset --hard origin/main
#   2. docker compose build (uses layer cache — fast when only source changes)
#   3. wait for the worker to be idle, then docker compose up -d --force-recreate
#   4. 30s health check — auto-rollback if unhealthy
#
# R16 (audit 2026-10-31) — the recreate used to be blind: a long-but-healthy
# backtest (or any in-flight job) was killed every time a commit landed. Step
# 3 now asks the worker's `/health/idle` endpoint and waits for in-flight work
# to finish before recreating. When it is still busy after
# KESTREL_UPDATE_IDLE_WAIT_SEC the update is deferred to the next timer run
# instead, and the host files are rolled back so the next run sees the same
# diff and retries.
#
# No GitHub Actions, no GHCR, no external registry. The image is built on the VM.
#
# Update time: ~5s (no-op) or ~30-120s (rebuild, depending on what changed).
# Docker layer caching means pnpm install only re-runs when pnpm-lock.yaml changes.

set -euo pipefail

readonly APP_DIR="/opt/kestrel/app"
readonly COMPOSE_FILE="/opt/kestrel/docker-compose.yml"
readonly LOCK_FILE="/opt/kestrel/.update.lock"
readonly SHA_FILE="/opt/kestrel/.deployed-sha"
readonly ENV_FILE="/opt/kestrel/.env"
readonly CONTAINER="kestrel-worker"
readonly UNIT_SYNC_HELPER='/usr/local/sbin/kestrel-sync-systemd-units'

# R16 — how long to wait for in-flight work before deferring the recreate.
readonly WORKER_IDLE_URL="${KESTREL_WORKER_IDLE_URL:-http://127.0.0.1:8081/health/idle}"
readonly IDLE_WAIT_SEC="${KESTREL_UPDATE_IDLE_WAIT_SEC:-240}"
readonly IDLE_POLL_SEC="${KESTREL_UPDATE_IDLE_POLL_SEC:-15}"

# Load HC_UPDATE_UUID safely
HC_UUID=''
if [[ -f /opt/kestrel/.env ]]; then
  HC_UUID=$(grep -E '^HC_UPDATE_UUID=' /opt/kestrel/.env | cut -d= -f2- | tr -d '"' | tr -d "'" || true)
fi

ping_hc() {
  local status="${1:-success}"
  local body="${2:-}"
  [[ -z "$HC_UUID" ]] && return 0
  local url="https://hc-ping.com/$HC_UUID"
  [[ "$status" != "success" ]] && url="$url/$status"
  if [[ -n "$body" ]]; then
    curl -fsS -m 5 --data-raw "$body" "$url" >/dev/null 2>&1 || true
  else
    curl -fsS -m 5 "$url" >/dev/null 2>&1 || true
  fi
}

log() { printf '%s [docker-update] %s\n' "$(date -u +%FT%TZ)" "$*"; }

# R16 — the worker health token guards /health/idle; read it from the same env
# file the container was started with.
worker_health_token() {
  local token=''
  if [[ -f "$ENV_FILE" ]]; then
    token=$(grep -E '^WORKER_HEALTH_TOKEN=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)
  fi
  printf '%s' "$token"
}

# idle | busy | down
worker_idle_state() {
  local token code
  token=$(worker_health_token)
  if ! code=$(curl -sS -m 5 -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer ${token}" "$WORKER_IDLE_URL" 2>/dev/null); then
    printf 'down'
    return
  fi
  case "$code" in
    200) printf 'idle' ;;
    503) printf 'busy' ;;
    *) printf 'down' ;;
  esac
}

# Wait for an idle worker. 0 = idle (or already down, which a recreate
# fixes), 1 = still busy after IDLE_WAIT_SEC.
wait_for_worker_idle() {
  local state deadline
  deadline=$(( $(date +%s) + IDLE_WAIT_SEC ))
  while :; do
    state=$(worker_idle_state)
    case "$state" in
      idle) return 0 ;;
      down) log 'worker health endpoint unreachable — recreating without waiting'; return 0 ;;
    esac
    if (( $(date +%s) >= deadline )); then
      return 1
    fi
    log "worker busy with in-flight work — rechecking in ${IDLE_POLL_SEC}s"
    sleep "$IDLE_POLL_SEC"
  done
}

write_deployed_metadata() {
  local sha="$1"

  printf '%s\n' "$sha" > "$SHA_FILE"
  if grep -q '^DEPLOYED_SHA=' "$ENV_FILE"; then
    sed -i "s|^DEPLOYED_SHA=.*|DEPLOYED_SHA=$sha|" "$ENV_FILE"
  else
    printf 'DEPLOYED_SHA=%s\n' "$sha" >> "$ENV_FILE"
  fi
}

sync_host_files_for_commit() {
  local commit="$1"
  git reset --hard "$commit" >/dev/null

  if echo "$CHANGED_FILES" | grep -qE '^infra/cron-vm/scripts/'; then
    # Synchronize the complete host-script set and remove managed scripts
    # deleted by the commit. Do not touch unrelated operator files.
    local script
    local -a managed_scripts=(
      backup-db.sh backup-journal.sh backup-storage.sh backup-storage-ready.sh
      verify-restore.sh delete-tenant.sh export-tenant.sh _load-env.sh
      docker-autoheal.sh docker-update.sh webhook-listener.py
    )
    for script in "${managed_scripts[@]}"; do
      if [[ -f "$APP_DIR/infra/cron-vm/scripts/$script" ]]; then
        install -m 755 "$APP_DIR/infra/cron-vm/scripts/$script" "/opt/kestrel/scripts/$script"
      else
        rm -f "/opt/kestrel/scripts/$script"
      fi
    done
  fi

  if echo "$CHANGED_FILES" | grep -qE '^infra/cron-vm/units/'; then
    sudo /usr/bin/bash "$UNIT_SYNC_HELPER"
  fi

}

# Single-instance guard
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log 'another update run is in flight — skipping'
  exit 0
fi

# Must run as kestrel (in docker group)
if [[ "$(whoami)" != "kestrel" ]]; then
  log "ERROR: must run as kestrel (saw $(whoami))"
  ping_hc fail "wrong user: $(whoami)"
  exit 1
fi

cd "$APP_DIR"

PREV_SHA="$(git rev-parse HEAD)"
git fetch --quiet origin main || {
  log "git fetch failed"
  ping_hc fail "git fetch failed"
  exit 1
}
NEW_SHA="$(git rev-parse origin/main)"

if [[ "$PREV_SHA" == "$NEW_SHA" ]]; then
  log "no change ($PREV_SHA) — exit"
  exit 0
fi

log "upgrading $PREV_SHA -> $NEW_SHA"

# Check which files changed to decide if we need a Docker rebuild.
# Only worker code + its dependencies (packages/*, config files) need a rebuild.
# Frontend-only changes (apps/web/) skip the expensive docker compose build.
CHANGED_FILES=$(git diff --name-only "$PREV_SHA" "$NEW_SHA" 2>/dev/null || true)

# Paths that require a full Docker rebuild (worker + its monorepo deps).
# Everything else just needs a git pull (e.g., frontend, docs, infra scripts).
NEEDS_REBUILD=0
for pattern in \
  '^apps/worker/' \
  '^packages/ai/' \
  '^packages/db/' \
  '^packages/data/' \
  '^packages/indicators/' \
  '^packages/shared/' \
  '^packages/config/' \
  '^pnpm-lock.yaml$' \
  '^Dockerfile.worker$' \
  '^turbo.json$' \
  '^\.npmrc$' \
  '^package.json$'; do
  if echo "$CHANGED_FILES" | grep -qE "$pattern"; then
    NEEDS_REBUILD=1
    log "worker-relevant change detected: $(echo "$CHANGED_FILES" | grep -E "$pattern" | head -3 | tr '\n' ' ')"
    break
  fi
done

# Always git pull regardless. Host synchronization is kept as a transaction:
# if a unit/script sync fails, restore the previous checkout and host files.
log 'applying host files'
if ! sync_host_files_for_commit "$NEW_SHA"; then
  log 'host synchronization failed — restoring previous commit'
  sync_host_files_for_commit "$PREV_SHA" >/dev/null 2>&1 || true
  ping_hc fail 'host synchronization failed'
  exit 1
fi

if [[ "$NEEDS_REBUILD" -eq 0 ]]; then
  log "no worker-relevant changes — skipping Docker rebuild"
  echo "$NEW_SHA" > "$SHA_FILE"
  ping_hc success "applied $NEW_SHA (no rebuild)"
  exit 0
fi

# Tag the current image for instant rollback before building
docker tag kestrel-worker:local kestrel-worker:rollback 2>/dev/null || true

# Build the new image (Docker layer cache makes this fast)
# P5: DOCKER_BUILDKIT=1 ensures the pnpm store cache mount in Dockerfile.worker
# is honoured. Without it, every rebuild re-downloads all pnpm packages.
log "building Docker image"
if ! DOCKER_BUILDKIT=1 docker compose -f "$COMPOSE_FILE" build --quiet 2>&1; then
  log "docker compose build failed — rolling back"
  sync_host_files_for_commit "$PREV_SHA" >/dev/null 2>&1 || true
  ping_hc fail "build failed at $NEW_SHA"
  exit 1
fi

# R16 — gate the recreate on idle. The worker answers /health/idle 200 only
# when no scheduled job and no queue job is in flight, so a long backtest is
# never killed by a deploy. If it is still busy after the wait window, defer
# this commit to the next timer run rather than forcing the restart.
if ! wait_for_worker_idle; then
  log "worker still busy after ${IDLE_WAIT_SEC}s — deferring the container recreate to the next update run"
  # Roll the checkout and host files back to the running image's commit so the
  # next run sees the same diff and retries. Nothing was recreated, so the
  # deployed metadata still names the code the container is actually running.
  sync_host_files_for_commit "$PREV_SHA" >/dev/null 2>&1 || true
  ping_hc success "deferred $NEW_SHA: worker busy with in-flight work"
  exit 0
fi

# Stage runtime metadata before recreating the container so its logs and
# health diagnostics report the code that was actually deployed. Rollback
# paths restore the previous metadata before starting the old image.
write_deployed_metadata "$NEW_SHA"

# Restart with the new image
log "restarting container"
if ! docker compose -f "$COMPOSE_FILE" up -d --force-recreate --no-deps worker 2>&1; then
  log "docker compose up failed — rolling back"
  write_deployed_metadata "$PREV_SHA"
  docker tag kestrel-worker:rollback kestrel-worker:local 2>/dev/null || true
  docker compose -f "$COMPOSE_FILE" up -d --force-recreate --no-deps worker 2>/dev/null || true
  ping_hc fail "up failed at $NEW_SHA, rolled back"
  exit 1
fi

# Post-deploy health check (30s window)
HEALTH_WAIT_SEC=30
log "post-deploy health check — waiting ${HEALTH_WAIT_SEC}s"
sleep "$HEALTH_WAIT_SEC"

HEALTH_STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo "unknown")
if [[ "$HEALTH_STATUS" != "healthy" ]]; then
  log "health check failed (status: $HEALTH_STATUS) — rolling back"
  write_deployed_metadata "$PREV_SHA"
  docker tag kestrel-worker:rollback kestrel-worker:local 2>/dev/null || true
  sync_host_files_for_commit "$PREV_SHA" >/dev/null 2>&1 || true
  docker compose -f "$COMPOSE_FILE" build --quiet 2>/dev/null || true
  DOCKER_BUILDKIT=1 docker compose -f "$COMPOSE_FILE" up -d --force-recreate --no-deps worker 2>/dev/null || true
  ping_hc fail "health check failed (status: $HEALTH_STATUS) at $NEW_SHA, rolled back to $PREV_SHA"
  exit 1
fi

# Success — metadata was written before restart and is already current.

# Prune old images to reclaim disk
docker image prune -f >/dev/null 2>&1 || true

log "applied $NEW_SHA"
ping_hc success "applied $NEW_SHA"