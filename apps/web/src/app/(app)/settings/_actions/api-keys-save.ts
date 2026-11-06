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
// server actions are separate requests from the page
// that rendered them, so they inherit no tenant scope. Every DB phase below
// opens its own `withUserTenant` scope; unscoped under `kestrel_app` the
// stored-payload read returns no row and untouched keys would be dropped.
import { withUserTenant } from '@kestrel/db';
import { PROVIDER_IDS } from '@kestrel/shared/encryption';
import { revalidatePath } from 'next/cache';

import { auth } from '@/auth';
import {
  readUserApiKeyState,
  testUserApiKeyPatch,
  writeUserApiKeyPatch,
} from '@/lib/services/settings/user-settings';

import { BYOK_KEY_KEEP, BYOK_KEY_REMOVE } from '../api-keys/_components/byok-key-sentinel';
import { type SaveKeysResult } from './shared';

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
  // / Phase 1 (Task 1.1): the vault inputs are
  // write-only. An empty or absent field preserves the stored value (the form
  // no longer prefills a sentinel), the legacy KEEP sentinel from an open
  // pre-Phase-1 tab also preserves it, and only the explicit REMOVE sentinel
  // deletes a provider key.
  for (const id of PROVIDER_IDS) {
    const raw = formData.get(id);
    if (raw === null) continue;
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (value === BYOK_KEY_KEEP) continue;
    if (value === BYOK_KEY_REMOVE) {
      remove.push(id);
      clearedCount += 1;
    } else if (value.length > 0) {
      set[id] = value;
    }
  }

  try {
    const userId = session.user.id;
    const patch = { set, remove };

    // read and test outside the write transaction so provider
    // network calls never hold a database connection open.
    const before = await readUserApiKeyState(userId);
    const checks = await testUserApiKeyPatch(before, patch);
    const keys = await withUserTenant(userId, (db) =>
      writeUserApiKeyPatch(userId, patch, checks, { db }),
    );

    revalidatePath('/settings/api-keys');
    return {
      ok: true as const,
      data: {
        savedCount: Object.keys(keys).length,
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
