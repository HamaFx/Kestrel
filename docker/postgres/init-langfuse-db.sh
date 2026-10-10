#!/bin/bash
# Auto-create the langfuse database if it doesn't exist.
# Called by the postgres container's /docker-entrypoint-initdb.d/
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  SELECT 'CREATE DATABASE langfuse'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'langfuse')\gexec
EOSQL

# Provision the dedicated BYPASSRLS application-maintenance role. Runtime
# migrations grant it table privileges; this script sets the operator-owned
# password on a fresh volume. Tenant data never uses this role.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hamafx_admin') THEN
      CREATE ROLE hamafx_admin LOGIN BYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
    END IF;
  END
  $$;
  ALTER ROLE hamafx_admin WITH PASSWORD '${POSTGRES_ADMIN_PASSWORD}';
EOSQL
