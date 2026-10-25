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

// SPDX-License-Identifier: Apache-2.0

// Connection-string resolution, TLS policy, and storage-kind selection.
//
// Selection (first match wins):
// - `MASTRA_STORAGE=postgres` → PostgresStore against the direct (non-pooling)
//   connection string (DIRECT_URL → POSTGRES_URL_NON_POOLING → DATABASE_URL →
//   POSTGRES_URL). The direct connection avoids Supabase's transaction-mode
//   pooler, which can silently drop DDL during first-use table creation —
//   same rule as the Drizzle migration scripts.
// - `MASTRA_STORAGE=libsql`   → LibSQLStore backed by a file (default
//   `file:./.kestrel/mastra.db`) so local development stays zero-setup.
//   Note: libsql `:memory:` databases are per-connection, so multi-connection
//   workflows (schema init vs. domain writes) would see different databases —
//   never use `:memory:` here.
// - unset → postgres when a connection string exists, otherwise libsql.

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { mlog } from './log';
import type { MastraStorageKind } from './types';

/** Direct (non-pooling) connection string in the same order as the migration scripts. */
export function mastraDirectConnectionString(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): string | null {
  const e = env as Record<string, string | undefined>;
  return firstNonEmpty(
    e.DIRECT_URL,
    e.POSTGRES_URL_NON_POOLING,
    e.POSTGRES_PRISMA_URL,
    e.DATABASE_URL,
    e.POSTGRES_URL,
    process.env.DIRECT_URL,
    process.env.POSTGRES_URL_NON_POOLING,
    process.env.POSTGRES_PRISMA_URL,
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL,
  );
}

function firstNonEmpty(...values: Array<string | undefined>): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

/**
 * Pooled (PgBouncer transaction-mode) connection string for *runtime* Mastra
 * storage and vector queries.
 *
 * DDL/schema initialization legitimately needs the direct connection, but
 * routing steady-state runtime traffic over `DIRECT_URL` bypasses the pooler
 * and opens one un-pooled Postgres socket per serverless instance. A fleet of
 * instances plus the worker then exhausts `max_connections`. Runtime callers
 * use this pooled string; only explicit DDL paths use the direct one.
 */
export function mastraRuntimeConnectionString(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): string | null {
  const e = env as Record<string, string | undefined>;
  return firstNonEmpty(
    e.MASTRA_DATABASE_URL,
    e.DATABASE_URL,
    e.POSTGRES_URL,
    e.DIRECT_URL,
    e.POSTGRES_URL_NON_POOLING,
    process.env.MASTRA_DATABASE_URL,
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL,
    process.env.DIRECT_URL,
    process.env.POSTGRES_URL_NON_POOLING,
  );
}

const SUPABASE_ROOT_CA_2021 = `-----BEGIN CERTIFICATE-----
MIIDxDCCAqygAwIBAgIUbLxMod62P2ktCiAkxnKJwtE9VPYwDQYJKoZIhvcNAQEL
BQAwazELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5l
dyBDYXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJh
c2UgUm9vdCAyMDIxIENBMB4XDTIxMDQyODEwNTY1M1oXDTMxMDQyNjEwNTY1M1ow
azELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5ldyBD
YXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJhc2Ug
Um9vdCAyMDIxIENBMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqQXW
QyHOB+qR2GJobCq/CBmQ40G0oDmCC3mzVnn8sv4XNeWtE5XcEL0uVih7Jo4Dkx1Q
DmGHBH1zDfgs2qXiLb6xpw/CKQPypZW1JssOTMIfQppNQ87K75Ya0p25Y3ePS2t2
GtvHxNjUV6kjOZjEn2yWEcBdpOVCUYBVFBNMB4YBHkNRDa/+S4uywAoaTWnCJLUi
cvTlHmMw6xSQQn1UfRQHk50DMCEJ7Cy1RxrZJrkXXRP3LqQL2ijJ6F4yMfh+Gyb4
O4XajoVj/+R4GwywKYrrS8PrSNtwxr5StlQO8zIQUSMiq26wM8mgELFlS/32Uclt
NaQ1xBRizkzpZct9DwIDAQABo2AwXjALBgNVHQ8EBAMCAQYwHQYDVR0OBBYEFKjX
uXY32CztkhImng4yJNUtaUYsMB8GA1UdIwQYMBaAFKjXuXY32CztkhImng4yJNUt
aUYsMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAB8spzNn+4VU
tVxbdMaX+39Z50sc7uATmus16jmmHjhIHz+l/9GlJ5KqAMOx26mPZgfzG7oneL2b
VW+WgYUkTT3XEPFWnTp2RJwQao8/tYPXWEJDc0WVQHrpmnWOFKU/d3MqBgBm5y+6
jB81TU/RG2rVerPDWP+1MMcNNy0491CTL5XQZ7JfDJJ9CCmXSdtTl4uUQnSuv/Qx
Cea13BX2ZgJc7Au30vihLhub52De4P/4gonKsNHYdbWjg7OWKwNv/zitGDVDB9Y2
CMTyZKG3XEu5Ghl1LEnI3QmEKsqaCLv12BnVjbkSeZsMnevJPs1Ye6TjjJwdik5P
o/bKiIz+Fq8=
-----END CERTIFICATE-----`;

/**
 * Mirror of the `@kestrel/db` TLS policy (`packages/db/src/client.ts`,
 * `resolveSslOptions`). Mastra's Postgres client must not be allowed to
 * downgrade TLS in production.
 */
export function mastraSslOptions(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): boolean | { rejectUnauthorized: boolean; ca?: string } {
  const e = env as Record<string, string | undefined>;
  const dbDisableSsl = e.DB_DISABLE_SSL ?? process.env.DB_DISABLE_SSL;
  if (dbDisableSsl === 'true') {
    const localDocker = (e.KESTREL_LOCAL_DOCKER ?? process.env.KESTREL_LOCAL_DOCKER) === 'true';
    const nodeEnv = e.NODE_ENV ?? process.env.NODE_ENV;
    if (nodeEnv !== 'production' || localDocker) return false;
    throw new Error(
      '[mastra] DB_DISABLE_SSL=true is only permitted with KESTREL_LOCAL_DOCKER=true; ' +
        'configure verified TLS for production databases.',
    );
  }
  const rawCa = e.SUPABASE_CA_CERT ?? process.env.SUPABASE_CA_CERT;
  const ca = rawCa
    ? rawCa
        .replace(/^["']|["']$/g, '')
        .split(/\\n|\n/)
        .join('\n')
        .trim()
    : undefined;
  if (ca) return { ca, rejectUnauthorized: true };

  const anyDbUrl =
    (e.DATABASE_URL ?? process.env.DATABASE_URL) ||
    (e.POSTGRES_URL ?? process.env.POSTGRES_URL) ||
    (e.DIRECT_URL ?? process.env.DIRECT_URL) ||
    (e.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL_NON_POOLING) ||
    '';
  if (anyDbUrl.includes('supabase.co') || anyDbUrl.includes('supabase.com')) {
    return {
      ca: SUPABASE_ROOT_CA_2021,
      rejectUnauthorized: true,
    };
  }

  const nodeEnv = e.NODE_ENV ?? process.env.NODE_ENV;
  if (nodeEnv === 'production') return { rejectUnauthorized: true };
  return { rejectUnauthorized: false };
}

export function libsqlUrl(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): string {
  const e = env as Record<string, string | undefined>;
  const configured = e.MASTRA_LIBSQL_URL ?? process.env.MASTRA_LIBSQL_URL;
  if (configured && configured.length > 0) return configured;
  return 'file:./.kestrel/mastra.db';
}

export function resolveMastraStorageKind(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): MastraStorageKind {
  const e = env as Record<string, string | undefined>;
  const configured = e.MASTRA_STORAGE ?? process.env.MASTRA_STORAGE;
  return configured === 'postgres'
    ? 'postgres'
    : configured === 'libsql'
      ? 'libsql'
      : mastraDirectConnectionString(env) !== null
        ? 'postgres'
        : 'libsql';
}

export function ensureLibsqlParent(url: string): void {
  if (url === ':memory:' || !url.startsWith('file:')) return;
  const path = url.slice('file:'.length);
  if (!path || path === ':memory:') return;
  try {
    mkdirSync(dirname(path), { recursive: true });
  } catch (error) {
    mlog.warn('Could not create LibSQL storage directory (non-fatal)', {
      path: dirname(path),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
