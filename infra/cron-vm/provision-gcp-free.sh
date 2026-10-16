#!/usr/bin/env bash
# ==============================================================================
# Kestrel — Google Cloud Always Free (e2-micro, $0/mo) 1-Command Provisioner
# ==============================================================================
# Provisions or upgrades a Google Cloud `e2-micro` VM (1 GB RAM, 2 shared vCPU,
# up to 30 GB Standard Persistent Disk — $0/month on GCP Always Free in
# us-central1 / us-east1 / us-west1) with a 2 GB swapfile so Docker builds and
# AI embedding batches never OOM.
#
# Usage (run on the Ubuntu VM after SSHing in, or via `gcloud compute ssh`):
#   curl -fsSL https://raw.githubusercontent.com/HamaFx/Kestrel/main/infra/cron-vm/provision-gcp-free.sh | sudo bash
#   # OR from a cloned repo on the VM:
#   sudo bash infra/cron-vm/provision-gcp-free.sh
# ==============================================================================

set -euo pipefail

SWAP_SIZE_MB="${SWAP_SIZE_MB:-2048}"
APP_DIR="${APP_DIR:-/opt/hamafx/app}"
ENV_FILE="${ENV_FILE:-/opt/hamafx/.env}"

echo "==> [1/4] Configuring ${SWAP_SIZE_MB}MB swapfile for e2-micro (1 GB RAM protection)..."
if ! swapon --show | grep -q '/swapfile'; then
  if [ ! -f /swapfile ]; then
    fallocate -l "${SWAP_SIZE_MB}M" /swapfile || dd if=/dev/zero of=/swapfile bs=1M count="${SWAP_SIZE_MB}"
    chmod 600 /swapfile
    mkswap /swapfile
  fi
  swapon /swapfile
  if ! grep -q '^/swapfile ' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
  sysctl -w vm.swappiness=10 >/dev/null || true
  echo 'vm.swappiness=10' > /etc/sysctl.d/99-kestrel-swap.conf
  echo "    Swap enabled: $(free -h | awk '/Swap:/ {print $2}')"
else
  echo "    Swapfile already active."
fi

echo "==> [2/4] Ensuring Docker & Docker Compose plugin are installed..."
if ! command -v docker >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg git
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

echo "==> [3/4] Preparing /opt/hamafx directory..."
mkdir -p /opt/hamafx
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<'EOF'
# Populate these values from `node scripts/deploy-cloud.mjs` (.env.botkeep):
DATABASE_URL=
ADMIN_DATABASE_URL=
DIRECT_URL=
ENCRYPTION_SECRET=
PRODUCTION_URL=https://hamafx-ai.vercel.app
CRON_SECRET=
WORKER_HEALTH_TOKEN=
BIQUOTE_PROXY_TOKEN=
WORKER_MODE=docker
MULTI_USER_ENABLED=1
KESTREL_ENABLE_RLS=1
REGISTRATION_MODE=open
EOF
  chmod 600 "$ENV_FILE"
  echo "    Created template $ENV_FILE — fill in DATABASE_URL and ENCRYPTION_SECRET."
fi

echo "==> [4/4] Ready! Once $ENV_FILE is populated and the repo is cloned at $APP_DIR, start with:"
echo "    docker compose -f $APP_DIR/infra/cron-vm/docker-compose.free.yml --env-file $ENV_FILE up -d --build"
