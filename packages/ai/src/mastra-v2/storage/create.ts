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

// Store construction for the selected storage kind.

import { LibSQLStore } from '@mastra/libsql';
import { PostgresStore } from '@mastra/pg';

import {
  ensureLibsqlParent,
  libsqlUrl,
  mastraRuntimeConnectionString,
  mastraSslOptions,
  resolveMastraStorageKind,
} from './connection';
import { mlog } from './log';
import { mastraRetention } from './retention';
import type { MastraStorageKind, MastraStorageResult } from './types';

/**
 * Create the Mastra runtime store for the current environment.
 *
 * Constructing the store does not connect or create tables; Mastra
 * initializes its schema lazily on first use. Callers that need the schema
 * up front (server boot, worker boot) should await
 * `initializeMastraStorage(result)`.
 */
export function createMastraStorage(env: NodeJS.ProcessEnv = process.env): MastraStorageResult {
  const kind: MastraStorageKind = resolveMastraStorageKind(env);

  if (kind === 'postgres') {
    // Runtime storage uses the pooled URL; DDL/schema init still uses the
    // direct connection (see `initializeMastraStorage` callers with
    // `mastraDirectConnectionString`).
    const connectionString = mastraRuntimeConnectionString(env);
    if (!connectionString) {
      throw new Error(
        '[mastra] MASTRA_STORAGE=postgres requires DATABASE_URL, POSTGRES_URL, DIRECT_URL, ' +
          'or POSTGRES_URL_NON_POOLING to be set.',
      );
    }
    const schemaName = env.MASTRA_SCHEMA ?? 'mastra';
    const poolMax = Number(env.MASTRA_DB_POOL_MAX ?? env.MASTRA_STORAGE_POOL_MAX ?? '5');
    mlog.debug('Creating Mastra Postgres storage', {
      schemaName,
      poolMax: Number.isFinite(poolMax) && poolMax > 0 ? Math.floor(poolMax) : 5,
      ssl: env.NODE_ENV === 'production' ? 'verify' : 'insecure-dev',
    });
    return {
      storage: new PostgresStore({
        id: 'kestrel-mastra',
        connectionString,
        schemaName,
        ssl: mastraSslOptions(env),
        max: Number.isFinite(poolMax) && poolMax > 0 ? Math.floor(poolMax) : 5,
        idleTimeoutMillis: 20_000,
        retention: mastraRetention(),
      }),
      kind,
    };
  }

  const url = libsqlUrl(env);
  ensureLibsqlParent(url);
  mlog.debug('Creating Mastra LibSQL storage', { url });
  return { storage: new LibSQLStore({ id: 'kestrel-mastra', url }), kind };
}
