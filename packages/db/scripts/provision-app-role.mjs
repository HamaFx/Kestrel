#!/usr/bin/env node
/* eslint-disable no-console -- CLI provisioning output is its public interface. */
/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Provision the non-bypass `kestrel_app` role used by the web application.
 *
 * Audit 2026-10-31 (R1): RLS policies only apply to a connection whose role
 * cannot bypass them, and the bundled Docker stack currently connects as the
 * `hamafx` superuser. Migration 0094 creates `kestrel_app` deliberately
 * NOLOGIN (a password must never live in migration history) and migration
 * 0119 grants it table privileges. This script supplies the missing
 * deployment half — LOGIN and an operator-owned password — so existing
 * volumes (where the Postgres init scripts no longer run) can be provisioned
 * without recreating the database.
 *
 * Usage:
 *   POSTGRES_APP_PASSWORD=<16+ chars> DIRECT_URL=postgres://... \
 *     pnpm --filter @kestrel/db provision:app-role
 *
 * The privileged connection comes from DIRECT_URL, POSTGRES_URL_NON_POOLING,
 * ADMIN_DATABASE_URL, or DATABASE_URL — in that order. The password is never
 * printed. Safe to re-run.
 */
import postgres from 'postgres';
import { resolveScriptSsl } from './lib/ssl.mjs';

const ROLE_NAME = 'kestrel_app';
const MIN_PASSWORD_LENGTH = 16;
const PUBLIC_SCHEMA = 'public';

function resolvePrivilegedDatabaseUrl() {
  const databaseUrl =
    process.env.DIRECT_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.ADMIN_DATABASE_URL ||
    process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'Set DIRECT_URL (preferred), POSTGRES_URL_NON_POOLING, ADMIN_DATABASE_URL, or DATABASE_URL. ' +
        'Provisioning requires a direct connection as a role that can create and alter roles.',
    );
  }
  return databaseUrl;
}

function resolveAppPassword() {
  const password = process.env.POSTGRES_APP_PASSWORD || process.env.KESTREL_APP_PASSWORD;
  if (!password) {
    throw new Error(
      'POSTGRES_APP_PASSWORD (or its legacy alias KESTREL_APP_PASSWORD) is required; refusing to ' +
        `provision ${ROLE_NAME} without a credential.`,
    );
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `POSTGRES_APP_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters; refusing to install ` +
        `a weak ${ROLE_NAME} credential.`,
    );
  }
  return password;
}

const resolveSslOption = (url) => resolveScriptSsl(url);

let databaseUrl;
let appPassword;
try {
  databaseUrl = resolvePrivilegedDatabaseUrl();
  appPassword = resolveAppPassword();
} catch (error) {
  console.error(`[provision:app-role] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const sql = postgres(databaseUrl, {
  prepare: false,
  max: 1,
  ssl: resolveSslOption(databaseUrl),
});

try {
  const [existing] = await sql`SELECT 1 AS present FROM pg_roles WHERE rolname = ${ROLE_NAME}`;
  const action = existing ? 'updated' : 'created';

  // Build every statement server-side: PostgreSQL receives the password as a
  // query parameter and quotes it itself (%L), so the credential never
  // appears in this process's SQL text, logs, or error output.
  const [statements] = await sql`
    SELECT
      format(
        'CREATE ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD %L',
        ${ROLE_NAME}::text, ${appPassword}::text
      ) AS create_role,
      format(
        'ALTER ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD %L',
        ${ROLE_NAME}::text, ${appPassword}::text
      ) AS alter_role,
      format(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO %I',
        ${PUBLIC_SCHEMA}::text, ${ROLE_NAME}::text
      ) AS grant_tables,
      format(
        'GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA %I TO %I',
        ${PUBLIC_SCHEMA}::text, ${ROLE_NAME}::text
      ) AS grant_sequences,
      format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
        current_user, ${PUBLIC_SCHEMA}::text, ${ROLE_NAME}::text
      ) AS grant_default_tables,
      format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO %I',
        current_user, ${PUBLIC_SCHEMA}::text, ${ROLE_NAME}::text
      ) AS grant_default_sequences,
      current_user AS migration_role
  `;

  // Same attribute set migration 0094 creates, plus LOGIN.
  await sql.unsafe(existing ? statements.alter_role : statements.create_role);

  // Same grants migration 0119 applies, so a deployment that provisions after
  // migrating reaches the same state as one that snapshots the grants there.
  await sql.unsafe(statements.grant_tables);
  await sql.unsafe(statements.grant_sequences);
  await sql.unsafe(statements.grant_default_tables);
  await sql.unsafe(statements.grant_default_sequences);

  const [counts] = await sql`
    SELECT
      count(*) FILTER (WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f'))::int AS relations,
      count(*) FILTER (WHERE c.relkind = 'S')::int AS sequences
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = ${PUBLIC_SCHEMA} AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
  `;

  console.log(
    `[provision:app-role] ${ROLE_NAME} ${action} with LOGIN, NOSUPERUSER, NOBYPASSRLS (RLS applies to it).`,
  );
  console.log(
    `[provision:app-role] Granted SELECT, INSERT, UPDATE, DELETE on ${counts.relations} relation(s) ` +
      `and USAGE, SELECT, UPDATE on ${counts.sequences} sequence(s) in schema ${PUBLIC_SCHEMA}.`,
  );
  console.log(
    `[provision:app-role] Default privileges armed for future objects created by ${statements.migration_role}.`,
  );
  console.log(
    '[provision:app-role] Until DATABASE_URL points at this role, the app still connects as the superuser and RLS is not enforced.',
  );
} catch (error) {
  console.error(
    '[provision:app-role] Failed:',
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
