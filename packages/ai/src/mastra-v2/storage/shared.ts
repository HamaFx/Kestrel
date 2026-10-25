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

// Process-wide cached storage for maintenance / pruning jobs.

import type { MastraCompositeStore } from '@mastra/core/storage';
import { LibSQLStore } from '@mastra/libsql';
import { PostgresStore } from '@mastra/pg';

import { libsqlUrl, mastraRuntimeConnectionString, resolveMastraStorageKind } from './connection';
import { createMastraStorage } from './create';
import { mlog } from './log';
import type { MastraStorageResult } from './types';

/**
 * Process-wide cached storage for maintenance / pruning jobs (Audit v3 Phase 7,
 * fixes P1-6). Anchored on `globalThis` (Phase 2, P1-03) so Next.js HMR
 * re-evaluations reuse the live pool instead of stranding a 5-connection
 * `pg.Pool`.
 *
 * D-01 / C-01 (audit 2026-10-18) — OWNERSHIP: `getKestrelMastra().instance`
 * is the storage owner for every long-lived process (web, worker, Studio).
 * This helper exists so maintenance jobs that run before/without a live
 * instance (retention cron, scripts) can reuse one pool instead of opening a
 * second one; it is deliberately NOT re-exported from the public barrels
 * anymore — new code should resolve storage through the Mastra instance and
 * only fall back to this helper on maintenance paths (as `pruneMastraStorage`
 * does when called without an argument).
 */
const globalForMastraStorage = globalThis as unknown as {
  __kestrelMastraStorageCache?: { key: string; result: MastraStorageResult } | null;
};

function storageCacheKey(env: NodeJS.ProcessEnv = process.env): string {
  const kind = resolveMastraStorageKind(env);
  if (kind === 'postgres') {
    const conn = mastraRuntimeConnectionString(env) ?? '';
    const schema = env.MASTRA_SCHEMA ?? 'mastra';
    return `postgres:${conn}:${schema}`;
  }
  return `libsql:${libsqlUrl(env)}`;
}

function isMockConstructorCleared(fn: unknown): boolean {
  if (typeof fn !== 'function' || !('mock' in fn)) return false;
  const mockObj = (fn as { mock?: { calls?: unknown[] } }).mock;
  return Array.isArray(mockObj?.calls) && mockObj.calls.length === 0;
}

/**
 * Internal helper for maintenance paths without a live instance. NOT part of
 * the public barrel surface (D-01/C-01): the Mastra instance owns storage in
 * normal operation.
 */
export function getSharedMastraStorage(env: NodeJS.ProcessEnv = process.env): MastraStorageResult {
  const key = storageCacheKey(env);
  const cached = globalForMastraStorage.__kestrelMastraStorageCache ?? null;
  const mockCleared =
    isMockConstructorCleared(PostgresStore) && isMockConstructorCleared(LibSQLStore);
  if (cached && cached.key === key && !mockCleared) {
    return cached.result;
  }
  const result = createMastraStorage(env);
  globalForMastraStorage.__kestrelMastraStorageCache = { key, result };
  return result;
}

export function _resetMastraStorageCache(): void {
  globalForMastraStorage.__kestrelMastraStorageCache = null;
}

/** Close the shared Mastra storage pool (graceful shutdown / tests). */
export async function closeMastraStorage(): Promise<void> {
  const cached = globalForMastraStorage.__kestrelMastraStorageCache ?? null;
  if (!cached) return;
  const store = cached.result.storage as MastraCompositeStore & {
    close?: () => Promise<void>;
  };
  if (typeof store.close === 'function') {
    await store.close();
    mlog.info('Mastra storage pool closed', { kind: cached.result.kind });
  }
  globalForMastraStorage.__kestrelMastraStorageCache = null;
}
