#!/bin/bash
# Provision the dedicated application roles on a fresh volume.
# Called by the postgres container's /docker-entrypoint-initdb.d/
#
# Init scripts only run when the data volume is created. Existing volumes are
# provisioned later with `pnpm --filter @kestrel/db provision:app-role`
# (kestrel_app) — see docs/configuration.md and the audit doc
# docs/audit/kestrel-architecture-db-audit-2026-10-31.md (R1).
set -e
# NOTE: \$\$ inside the unquoted heredocs below escapes the dollar quoting so
# bash leaves PostgreSQL's DO blocks intact while still expanding the password
# variables. Do not "simplify" those escapes.
# Provision the dedicated BYPASSRLS application-maintenance role. Runtime
# migrations grant it table privileges; this script sets the operator-owned
# password on a fresh volume. Tenant data never uses this role.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hamafx_admin') THEN
      CREATE ROLE hamafx_admin LOGIN BYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
    END IF;
  END
  \$\$;
  ALTER ROLE hamafx_admin WITH PASSWORD '${POSTGRES_ADMIN_PASSWORD}';
EOSQL

# Provision the non-bypass web-application role. Migration 0094 creates this
# role as NOLOGIN (credentials never live in migration history) and migration
# 0119 grants it table privileges; this script only adds LOGIN and the
# operator-owned password on a fresh volume, so RLS applies to the app once
# DATABASE_URL points at it. Skip cleanly when the password is empty so
# deployments that have not generated it yet keep starting.
if [ -n "${POSTGRES_APP_PASSWORD:-}" ]; then
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    DO \$\$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kestrel_app') THEN
        CREATE ROLE kestrel_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
      END IF;
    END
    \$\$;
    ALTER ROLE kestrel_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD '${POSTGRES_APP_PASSWORD}';
EOSQL
else
  echo "POSTGRES_APP_PASSWORD is empty — skipping kestrel_app provisioning."
  echo "Existing volumes: run 'pnpm --filter @kestrel/db provision:app-role' once a password is set."
fi
