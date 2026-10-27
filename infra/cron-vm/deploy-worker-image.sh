#!/usr/bin/env bash
# Ship-built worker deployment (replaces building on the VM).
#
# Why: the GCP e2-micro cannot realistically build this image — its npm
# downloads run at tens of KiB/s and the box swaps on 1 GB of RAM. Build on a
# machine with a real network (workstation or CI), then push the finished image
# to the VM, which only loads and restarts the container.
#
# Order of operations:
#   1. "affected" gate — skip everything unless @kestrel/worker (or any
#      workspace package it depends on) changed since the SHA currently
#      deployed on the VM. `--force` bypasses the gate.
#   2. build the image locally from Dockerfile.worker
#   3. tag the VM's current image as the rollback point, transfer + load the
#      new image
#   4. recreate the worker container, wait for HEALTHY, roll back on failure
#
# Usage:
#   infra/cron-vm/deploy-worker-image.sh [--force]
#
# Env overrides:
#   VM=kestrel-worker  ZONE=us-central1-a
#   VM_APP_DIR=/opt/hamafx/app  VM_ENV_FILE=/opt/hamafx/.env
#   VM_COMPOSE=infra/cron-vm/docker-compose.free.yml
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

VM="${VM:-kestrel-worker}"
ZONE="${ZONE:-us-central1-a}"
VM_APP_DIR="${VM_APP_DIR:-/opt/hamafx/app}"
VM_ENV_FILE="${VM_ENV_FILE:-/opt/hamafx/.env}"
VM_COMPOSE="${VM_COMPOSE:-infra/cron-vm/docker-compose.free.yml}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

SHA="$(git rev-parse HEAD)"
SHORT="$(git rev-parse --short HEAD)"
FORCE=0
[[ "${1:-}" == "--force" ]] && FORCE=1

ssh_vm() { gcloud compute ssh "$VM" --zone "$ZONE" --quiet --command "$1"; }

echo "[deploy] target $VM ($ZONE), commit $SHORT"

# ── 1. Affected gate ────────────────────────────────────────────────────────
if [[ "$FORCE" != "1" ]]; then
  DEPLOYED="$(ssh_vm 'cat /opt/kestrel/.deployed-sha 2>/dev/null || true' 2>/dev/null || true)"
  if [[ -n "$DEPLOYED" ]]; then
    echo "[deploy] deployed SHA on VM: $DEPLOYED"
    if ./node_modules/.bin/turbo query affected --base "$DEPLOYED" --packages=@kestrel/worker --exit-code >/dev/null 2>&1; then
      echo "[deploy] nothing under @kestrel/worker... changed since $DEPLOYED — skipping build and deploy"
      exit 0
    fi
    echo "[deploy] worker is affected — building"
  else
    echo "[deploy] no deployed-SHA marker on VM yet — building (first run of this script)"
  fi
fi

# ── 2. Build ────────────────────────────────────────────────────────────────
echo "[deploy] building hamafx-worker:latest"
DOCKER_BUILDKIT=1 docker build \
  -f "$REPO_ROOT/Dockerfile.worker" \
  --build-arg "DEPLOYED_SHA=$SHORT" \
  -t hamafx-worker:latest \
  "$REPO_ROOT"
echo "[deploy] image built:"
docker images hamafx-worker:latest --format '  {{.Repository}}:{{.Tag}} {{.Size}}'

# ── 3. Transfer ─────────────────────────────────────────────────────────────
echo "[deploy] compressing + transferring image (a few minutes on home upload)"
docker save hamafx-worker:latest | gzip -1 > "$TMP_DIR/worker-image.tar.gz"
ls -lh "$TMP_DIR/worker-image.tar.gz"
gcloud compute scp "$TMP_DIR/worker-image.tar.gz" "$VM:~/worker-image.tar.gz" --zone "$ZONE" --quiet

# ── 4. Load + recreate + health gate (with rollback) ────────────────────────
echo "[deploy] loading image and recreating worker on the VM"
ssh_vm "set -e
  sudo docker tag hamafx-worker:latest hamafx-worker:rollback-manual
  gunzip -c \$HOME/worker-image.tar.gz | sudo docker load
  rm -f \$HOME/worker-image.tar.gz
  cd '$VM_APP_DIR'
  sudo env DEPLOYED_SHA='$SHORT' docker compose --env-file '$VM_ENV_FILE' -f '$VM_COMPOSE' up -d worker
  echo '$SHA' | sudo tee /opt/kestrel/.deployed-sha >/dev/null

  status=unknown
  for i in \$(seq 1 80); do
    status=\$(sudo docker inspect hamafx-worker --format '{{.State.Health.Status}}' 2>/dev/null || echo missing)
    [ \"\$status\" = healthy ] && break
    sleep 3
  done
  sudo docker ps --filter name=hamafx-worker --format '{{.Status}}'

  if [ \"\$status\" != healthy ]; then
    echo '[deploy] NOT healthy — rolling back to previous image'
    sudo docker tag hamafx-worker:rollback-manual hamafx-worker:latest
    cd '$VM_APP_DIR' && sudo docker compose --env-file '$VM_ENV_FILE' -f '$VM_COMPOSE' up -d worker
    exit 1
  fi
  echo '[deploy] worker healthy'
"
echo "[deploy] done — $SHORT is live on $VM"
