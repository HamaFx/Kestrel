#!/usr/bin/env sh
# Optional local maintenance for Kestrel Docker development.
# This intentionally does not remove named volumes or tagged images.
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"
exec pnpm docker:prune -- --apply
