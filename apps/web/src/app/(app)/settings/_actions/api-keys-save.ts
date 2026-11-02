'use server';

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

// API-keys save action: BYOK key create/update/clear with provider health
// checks and an atomic settings + provider-tests write.
//
// Audit 2026-10-31 (R1): server actions are separate requests from the page
// that rendered them, so they inherit no tenant scope. Every DB phase below
// opens its own `withUserTenant` scope; unscoped under `kestrel_app` the
// stored-payload read returns no row and untouched keys would be dropped.
import { testProviderKey } from '@kestrel/ai';
import {
  deleteProviderTestResult,
  mergeUserByokKeys,
  readUserByokState,
  recordProviderTestResult,
  withUserTenant,
} from '@kestrel/db';
import { JEV_PROVIDER_IDS, PROVIDER_IDS, type ProviderId } from '@kestrel/shared/encryption';
import { revalidatePath } from 'next/cache';

import { auth } from '@/auth';

import { BYOK_KEY_KEEP } from '../api-keys/_components/byok-key-sentinel';
import { JEV_DECISION_KEY_KEEP } from '../api-keys/_components/jev-decision-keys';
import { type SaveKeysResult } from './shared';

type ProviderTestResult =
  | { id: string; action: 'upsert'; ok: boolean; error: string | null }
  | { id: string; action: 'delete' };

/**
 * Server action to save/update/clear API keys for all BYOK providers.
 * Tests changed keys and stores health results.
 */
export async function updateApiKeysAction(
  _prevState: SaveKeysResult,
  formData: FormData,
): Promise<SaveKeysResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Not authenticated' };
  }

  const set: Record<string, string> = {};
  const remove: string[] = [];
  let clearedCount = 0;
  // Audit 2026-10-31 (R5): write-only inputs submit the KEEP sentinel for a
  // stored key the user did not touch, and an absent field means the form did
  // not speak about that provider at all (older client, or a provider missing
  // from the catalog). Both cases preserve whatever is stored — only an
  // explicitly empty field clears a key.
  for (const id of PROVIDER_IDS) {
    const raw = formData.get(id);
    if (raw === null) continue;
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (value === BYOK_KEY_KEEP) continue;
    if (value.length > 0) {
      set[id] = value;
    } else {
      remove.push(id);
      clearedCount += 1;
    }
  }

  try {
    const userId = session.user.id;

    // Audit 2026-10-31 (R1): read the stored payload inside the user's scope.
    // The patch below only names providers the form spoke about, so untouched
    // keys (including the Jev decision keys and finnhub) are carried forward.
    const before = await withUserTenant(userId, (db) => readUserByokState(userId, db));

    // STAB-10: Run all network calls (testProviderKey) BEFORE opening a
    // DB transaction so we don't hold a connection open during I/O.
    const testedAt = new Date();
    const testResults: ProviderTestResult[] = [];

    for (const [id, value] of Object.entries(set)) {
      if (value === before.keys[id as ProviderId]) continue;
      const result = await testProviderKey(id as ProviderId, value);
      testResults.push({
        id,
        action: 'upsert',
        ok: result.ok,
        error: result.ok ? null : (result.error ?? 'unknown error'),
      });
    }
    for (const id of remove) {
      if (!before.keys[id as ProviderId]) continue;
      testResults.push({ id, action: 'delete' });
    }

    // STAB-10: Atomic write — the vault update and every health row commit in
    // one user-tenant transaction, after the network calls above.
    const merged = await withUserTenant(userId, () =>
      mergeUserByokKeys(
        userId,
        { set, remove },
        {
          changedAt: testedAt.toISOString(),
          afterWrite: async (tx) => {
            for (const result of testResults) {
              if (result.action === 'upsert') {
                await recordProviderTestResult(
                  userId,
                  {
                    providerId: result.id,
                    ok: result.ok,
                    error: result.error,
                  },
                  { db: tx, testedAt },
                );
              } else {
                await deleteProviderTestResult(userId, result.id, { db: tx });
              }
            }
          },
        },
      ),
    );

    revalidatePath('/settings/api-keys');
    return {
      ok: true as const,
      data: {
        savedCount: Object.keys(merged.keys).length,
        clearedCount,
        at: Date.now(),
      },
    };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Decision 4A — save the Jev System One decision-model keys (OpenCode /
 * Liquid / TypeSafe) without touching the chat providers or the finnhub
 * market-data key. An empty field clears that decision key; the
 * `***KEEP***` prefill sentinel (or an absent field) preserves the stored
 * value.
 */
export async function updateJevApiKeysAction(
  _prevState: SaveKeysResult,
  formData: FormData,
): Promise<SaveKeysResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Not authenticated' };
  }

  try {
    const userId = session.user.id;

    const set: Record<string, string> = {};
    const remove: string[] = [];
    let savedCount = 0;

    for (const id of JEV_PROVIDER_IDS) {
      const raw = formData.get(id);
      // An absent field preserves the stored key (older clients, partial posts).
      if (raw === null) continue;
      const value = typeof raw === 'string' ? raw.trim() : '';
      // The prefilled sentinel means "leave the stored key as-is".
      if (value === JEV_DECISION_KEY_KEEP) continue;
      if (value.length === 0) {
        remove.push(id);
        continue;
      }
      set[id] = value;
      savedCount += 1;
    }

    // Preservation invariant: the chat providers and finnhub have no inputs in
    // this form. The patch only names Jev ids, so `mergeUserByokKeys` carries
    // every other stored key forward.
    const merged = await withUserTenant(userId, () => mergeUserByokKeys(userId, { set, remove }));

    const clearedCount = merged.removed.length;

    revalidatePath('/settings/api-keys');
    return {
      ok: true as const,
      data: { savedCount, clearedCount, at: Date.now() },
    };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
