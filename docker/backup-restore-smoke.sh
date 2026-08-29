#!/usr/bin/env sh
# P3: Disposable Docker backup/restore smoke test.
set -eu

PROJECT_NAME="kestrel-backup-smoke-$$"
VOLUME_PREFIX="${PROJECT_NAME}"
export COMPOSE_PROJECT_NAME="$PROJECT_NAME"
export POSTGRES_PUBLISHED_PORT='127.0.0.1:0'
export POSTGRES_VOLUME_NAME="${VOLUME_PREFIX}_pgdata"
export BACKUP_VOLUME_NAME="${VOLUME_PREFIX}_backup-data"

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
BASE_COMPOSE_FILE="$ROOT_DIR/docker-compose.yml"
cd "$ROOT_DIR"
compose() { docker compose -f "$BASE_COMPOSE_FILE" "$@"; }
cleanup() { compose down --volumes --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT

compose up -d db
ready=0
for _ in $(seq 1 90); do
  if compose exec -T db pg_isready -U hamafx -d hamafx >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done
if [ "$ready" -ne 1 ]; then
  compose logs db >&2 || true
  echo 'database did not become ready' >&2
  exit 1
fi

compose exec -T db psql -v ON_ERROR_STOP=1 -U hamafx -d hamafx <<'SQL'
CREATE TABLE IF NOT EXISTS p3_backup_smoke (id integer PRIMARY KEY, marker text NOT NULL);
INSERT INTO p3_backup_smoke (id, marker) VALUES (1, 'before-backup')
ON CONFLICT (id) DO UPDATE SET marker = EXCLUDED.marker;
SQL

compose run --rm --no-deps backup /usr/local/bin/backup-db.sh --once
compose run --rm --no-deps backup /usr/local/bin/backup-healthcheck.sh
compose exec -T db psql -v ON_ERROR_STOP=1 -U hamafx -d hamafx \
  -c "UPDATE p3_backup_smoke SET marker = 'after-backup' WHERE id = 1;" >/dev/null

KESTREL_RESTORE_CONFIRM=YES "$ROOT_DIR/docker/restore-db.sh" latest
marker="$(compose exec -T db psql -At -U hamafx -d hamafx -c 'SELECT marker FROM p3_backup_smoke WHERE id = 1;' | tr -d '\r')"
if [ "$marker" != 'before-backup' ]; then
  echo "backup restore verification failed: marker=$marker" >&2
  exit 1
fi

echo 'Docker backup/restore smoke test passed.'
