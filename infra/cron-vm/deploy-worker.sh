#!/usr/bin/env bash
# infra/cron-vm/deploy-worker.sh — Deploy worker from GitHub to Docker.
#
# Runs inside a systemd-run scope so it survives SSH disconnect.
# Usage:
#   sudo bash /opt/kestrel/scripts/deploy-worker.sh
#
# Workflow:
#   1. Fix git ownership (if needed)
#   2. git pull origin main
#   3. Update /opt/kestrel/.deployed-sha
#   4. docker compose build worker
#   5. docker compose up -d worker
#   6. Wait for health check
#
set -euo pipefail

readonly APP_DIR='/opt/kestrel/app'
readonly INSTALL_DIR='/opt/kestrel'
readonly SERVICE_NAME='worker'

log() { printf '%s [deploy-worker] %s\n' "$(date -u +%FT%TZ)" "$*"; }

if [[ "$EUID" -ne 0 ]]; then
  echo "must run as root (sudo bash deploy-worker.sh)" >&2
  exit 1
fi

# ── 1. Fix git ownership (common issue when git was run as root) ────────
log 'fixing git ownership'
chown -R kestrel:kestrel "$APP_DIR/.git"

# ── 2. Pull latest code ─────────────────────────────────────────────────
log 'pulling latest code from GitHub'
sudo -u kestrel git -C "$APP_DIR" fetch --quiet origin main
sudo -u kestrel git -C "$APP_DIR" reset --hard origin/main
NEW_SHA=$(sudo -u kestrel git -C "$APP_DIR" rev-parse HEAD)
log "HEAD is now at $NEW_SHA"

# ── 3. Update deployed SHA ──────────────────────────────────────────────
echo "$NEW_SHA" > "$INSTALL_DIR/.deployed-sha"
chmod 644 "$INSTALL_DIR/.deployed-sha"

# ── 4. Build the worker image ────────────────────────────────────────────
# C5: Tag the current image for instant rollback before building, matching
# the safety pattern used by docker-update.sh.
log 'tagging current image for rollback'
sudo -u kestrel docker tag kestrel-worker:local kestrel-worker:rollback 2>/dev/null || true

log 'building worker Docker image'
cd "$INSTALL_DIR"
# P5: DOCKER_BUILDKIT=1 ensures the pnpm store cache mount in Dockerfile.worker
# is honoured. Without it, every rebuild re-downloads all pnpm packages.
sudo -u kestrel -E DOCKER_BUILDKIT=1 docker compose build "$SERVICE_NAME" 2>&1
log 'build complete'

# ── 5. Replace the running container ─────────────────────────────────────
log 'replacing old container'
sudo -u kestrel docker compose up -d "$SERVICE_NAME" 2>&1

# ── 6. Wait for health check ────────────────────────────────────────────
log 'waiting for container to become healthy (up to 120s)'
for i in $(seq 1 60); do
  status=$(sudo docker ps --filter "name=kestrel-worker" --format '{{.Status}}' 2>/dev/null)
  if echo "$status" | grep -q healthy; then
    log "container healthy after $((i*2))s"
    break
  fi
  if [[ "$i" -eq 60 ]]; then
    # C5: Rollback to the previous image if the new one fails health check.
    log "WARNING: container not healthy after 120s — status=$status"
    sudo docker logs "kestrel-worker" --tail 10 2>/dev/null || true
    log 'rolling back to previous image'
    sudo -u kestrel docker tag kestrel-worker:rollback kestrel-worker:local 2>/dev/null || true
    sudo -u kestrel docker compose up -d --force-recreate --no-deps "$SERVICE_NAME" 2>/dev/null || true
    exit 1
  fi
  sleep 2
done

log "deploy complete — $NEW_SHA"
