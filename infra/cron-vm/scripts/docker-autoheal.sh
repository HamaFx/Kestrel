#!/usr/bin/env bash
# infra/cron-vm/scripts/docker-autoheal.sh
#
# Runs every minute via kestrel-docker-autoheal.timer.
# Checks if the kestrel-worker container is healthy.
# If unhealthy for 3 consecutive checks (3 minutes), restarts it.
#
# Docker's restart:unless-stopped handles crashes (exit code != 0),
# but does NOT restart unhealthy containers. This script fills that gap.
#
# R16 (audit 2026-10-31) — busy is not wedged. Docker's health status folds
# `/health/jobs` in, and that probe fails when a scheduled job has overrun its
# own budget plus grace, or when the process could not answer in time.
# A long-but-healthy backtest used to look exactly like that and was killed
# mid-flight. Before counting an unhealthy observation, this script asks the
# worker directly:
#   HTTP 200 -> responsive and jobsHealthy (busy is fine) -> do not count
#   HTTP 503 -> a job is genuinely stuck -> count towards a restart
#   no answer -> unresponsive -> count towards a restart
# The worker answers between sandbox combinations now (R16 yields), so a busy
# backtest reports 200 "idle: false" instead of timing out the probe.

set -euo pipefail

# The GCP compose files name the container `hamafx-worker` (historic name);
# the root self-host compose may rename it, so allow an override.
readonly CONTAINER="${KESTREL_WORKER_CONTAINER:-hamafx-worker}"
# Overridable so tests can exercise the classification with stub docker/curl.
readonly STATE_FILE="${KESTREL_AUTOHEAL_STATE_FILE:-/opt/kestrel/.autoheal-state}"
readonly MAX_UNHEALTHY=3
# The VM/free compose profiles publish the health port on 127.0.0.1 only.
readonly HEALTH_URL="${KESTREL_WORKER_HEALTH_URL:-http://127.0.0.1:8081/health/jobs}"
readonly ENV_FILE="${KESTREL_ENV_FILE:-/opt/kestrel/.env}"

log() { printf '%s [autoheal] %s\n' "$(date -u +%FT%TZ)" "$*"; }

# WORKER_HEALTH_TOKEN is required in production; read it from the env file the
# container itself was started with instead of assuming a host shell export.
health_token() {
  local token=''
  if [[ -f "$ENV_FILE" ]]; then
    token=$(grep -E '^WORKER_HEALTH_TOKEN=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)
  fi
  printf '%s' "$token"
}

# 0 = worker answered and reports no wedged job (busy is fine)
# 1 = worker answered and reports a wedged job
# 2 = worker did not answer
probe_worker() {
  local token body status
  token=$(health_token)
  if ! body=$(curl -sS -m 5 -o - -w '\n%{http_code}' \
    -H "Authorization: Bearer ${token}" "$HEALTH_URL" 2>/dev/null); then
    return 2
  fi
  status=$(printf '%s' "$body" | tail -n 1)
  case "$status" in
    200) return 0 ;;
    503) return 1 ;;
    *) return 2 ;;
  esac
}

# Read consecutive unhealthy count
count=0
[[ -f "$STATE_FILE" ]] && count=$(cat "$STATE_FILE" 2>/dev/null || echo 0)

HEALTH_STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo "not-found")

if [[ "$HEALTH_STATUS" == "healthy" ]]; then
  echo 0 > "$STATE_FILE"
  exit 0
fi

if [[ "$HEALTH_STATUS" == "not-found" ]]; then
  log "container $CONTAINER not found — skipping"
  exit 0
fi

# Container is unhealthy or starting. Classify before counting it: a worker
# that answers /health/jobs with 200 is responsive and has no wedged job, so
# its failed healthcheck was a transient block (a busy backtest, a slow DB)
# and must not accumulate towards a restart.
probe_rc=2
if probe_worker; then
  probe_rc=0
else
  probe_rc=$?
fi
case "$probe_rc" in
  0)
    log "docker health=$HEALTH_STATUS but /health/jobs answers 200 (busy, no wedged job) — not counting towards a restart"
    echo 0 > "$STATE_FILE"
    exit 0
    ;;
  1)
    log "docker health=$HEALTH_STATUS and /health/jobs reports a wedged job — counting towards a restart"
    ;;
  *)
    log "docker health=$HEALTH_STATUS and /health/jobs did not answer — counting towards a restart"
    ;;
esac

count=$((count + 1))
echo "$count" > "$STATE_FILE"

if (( count >= MAX_UNHEALTHY )); then
  log "container unhealthy for $count consecutive checks — restarting"
  # B7: Don't swallow restart failures — log them so an operator can see
  # why the autoheal didn't recover the container. The VM compose sets
  # stop_grace_period=30s, so docker restart can take up to 35s; the
  # systemd unit's TimeoutStartSec was raised to 90s to match.
  if ! docker restart "$CONTAINER" 2>&1 | tee /dev/stderr; then
    log "ERROR: docker restart failed for $CONTAINER"
  fi
  echo 0 > "$STATE_FILE"
fi
