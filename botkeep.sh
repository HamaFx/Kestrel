#!/usr/bin/env bash
# ==============================================================================
# Kestrel — Botkeep Founder Free & PaaS One-Command Entrypoint
# ==============================================================================
# In Botkeep's server settings, set the Startup Command to either:
#   node scripts/botkeep-start.mjs
# or:
#   bash botkeep.sh
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

exec node scripts/botkeep-start.mjs "$@"
