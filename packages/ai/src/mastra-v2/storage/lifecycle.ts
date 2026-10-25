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

// Schema initialization and retention pruning.

import type { MastraCompositeStore } from '@mastra/core/storage';

import { mlog } from './log';
import { getSharedMastraStorage } from './shared';
import type { MastraStorageResult } from './types';

/** Explicitly initialize the storage schema (idempotent). Safe to call at boot. */
export async function initializeMastraStorage(result: MastraStorageResult): Promise<void> {
  const store = result.storage as MastraCompositeStore & { init?: () => Promise<void> };
  if (typeof store.init === 'function') {
    await store.init();
    mlog.info('Mastra storage initialized', { kind: result.kind });
  }
}

/**
 * Run Mastra's age-based retention pruning (Phase 0 config, wired here).
 * Reuses `getSharedMastraStorage` so cron runs never leak Postgres connection pools.
 *
 * Accepts either the full `MastraStorageResult` wrapper or a raw
 * `MastraCompositeStore` (e.g. `getKestrelMastra().instance.getStorage()`),
 * so the worker can prune through the instance's existing pool instead of
 * spinning up a second `PostgresStore` just for retention (Phase 2, P1-02).
 *
 * Best-effort: logs failures, never throws.
 */
export async function pruneMastraStorage(
  existingStorage?: MastraStorageResult | MastraCompositeStore,
): Promise<{
  pruned: boolean;
  error?: string;
}> {
  try {
    const result: MastraStorageResult | undefined =
      existingStorage === undefined
        ? getSharedMastraStorage(process.env)
        : 'storage' in existingStorage
          ? (existingStorage as MastraStorageResult)
          : { storage: existingStorage, kind: 'postgres' };
    if (!result) return { pruned: false, error: 'no storage configured' };
    const store = result.storage as MastraCompositeStore & { prune?: () => Promise<void> };
    if (typeof store.prune === 'function') {
      await store.prune();
      mlog.info('Mastra storage retention pruning completed', { kind: result.kind });
      return { pruned: true };
    }
    mlog.debug('Mastra storage does not expose prune(); skipping retention', { kind: result.kind });
    return { pruned: false, error: 'storage.prune() not available' };
  } catch (error) {
    mlog.warn('Mastra storage retention pruning failed (non-fatal)', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { pruned: false, error: error instanceof Error ? error.message : String(error) };
  }
}
