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
import { getDb, testProviderKey } from '@kestrel/ai';
import { requireTenantIdForUser, schema } from '@kestrel/db';
import {
  decryptByok,
  encryptByok,
  JEV_PROVIDER_IDS,
  PROVIDER_IDS,
  type ByokPayload,
} from '@kestrel/shared/encryption';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auth } from '@/auth';

import { JEV_DECISION_KEY_KEEP } from './api-keys/_components/jev-decision-keys';
import { type SaveKeysResult } from './_actions-shared';

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

  const keys: ByokPayload = {};
  let clearedCount = 0;
  for (const id of PROVIDER_IDS) {
    const raw = formData.get(id);
    if (typeof raw === 'string' && raw.trim().length > 0) {
      keys[id] = raw.trim();
    } else {
      clearedCount += 1;
    }
  }

  try {
    const db = getDb();
    const tenantId = await requireTenantIdForUser(session.user.id, db);
    const [oldSettings] = await db
      .select({
        aiApiKeys: schema.userSettings.aiApiKeys,
        aiApiKeysUpdatedAt: schema.userSettings.aiApiKeysUpdatedAt,
      })
      .from(schema.userSettings)
      .where(
        and(
          eq(schema.userSettings.userId, session.user.id),
          eq(schema.userSettings.tenantId, tenantId),
        ),
      );
    const oldDecrypted = oldSettings?.aiApiKeys ? decryptByok(oldSettings.aiApiKeys) : null;
    const oldUpdatedAt = oldSettings?.aiApiKeysUpdatedAt ?? {};

    // Decision 4A — saving chat LLM keys must never wipe the non-chat keys.
    // The Jev decision-model keys (opencode/liquid/typesafe) and the finnhub
    // market-data key live on the same payload but have no inputs in this
    // form, so carry the stored values forward.
    for (const preservedId of [...JEV_PROVIDER_IDS, 'finnhub'] as const) {
      const existing = oldDecrypted?.[preservedId];
      if (existing) keys[preservedId] = existing;
    }

    const newUpdatedAt = { ...oldUpdatedAt };
    for (const id of PROVIDER_IDS) {
      const oldKey = oldDecrypted?.[id];
      const newKey = keys[id];
      if (newKey && newKey !== oldKey) {
        newUpdatedAt[id] = new Date().toISOString();
      } else if (!newKey && oldKey) {
        delete newUpdatedAt[id];
      }
    }

    // STAB-10: Run all network calls (testProviderKey) BEFORE opening a
    // DB transaction so we don't hold a connection open during I/O.
    const testedAt = new Date();
    const testResults: Array<{
      id: string;
      action: 'upsert' | 'delete';
      ok?: boolean;
      error?: string;
    }> = [];

    for (const id of PROVIDER_IDS) {
      const oldKey = oldDecrypted?.[id];
      const newKey = keys[id];

      if (newKey && newKey !== oldKey) {
        const result = await testProviderKey(id, newKey);
        if (result.ok) {
          testResults.push({ id, action: 'upsert', ok: true });
        } else {
          testResults.push({
            id,
            action: 'upsert',
            ok: false,
            error: result.error ?? 'unknown error',
          });
        }
      } else if (!newKey && oldKey) {
        testResults.push({ id, action: 'delete' });
      }
    }

    // STAB-10: Atomic write — all DB mutations inside one transaction.
    const userId = session.user.id;
    await db.transaction(async (tx) => {
      await tx
        .update(schema.userSettings)
        .set({
          aiApiKeys: Object.keys(keys).length > 0 ? encryptByok(keys) : null,
          aiApiKeysUpdatedAt: Object.keys(newUpdatedAt).length > 0 ? newUpdatedAt : null,
        })
        .where(
          and(eq(schema.userSettings.userId, userId), eq(schema.userSettings.tenantId, tenantId)),
        );

      for (const tr of testResults) {
        await tx
          .delete(schema.providerTests)
          .where(
            and(
              eq(schema.providerTests.userId, userId),
              eq(schema.providerTests.tenantId, tenantId),
              eq(schema.providerTests.providerId, tr.id),
            ),
          );
        if (tr.action === 'upsert') {
          await tx.insert(schema.providerTests).values({
            userId,
            tenantId,
            providerId: tr.id,
            ok: tr.ok!,
            error: tr.ok ? null : (tr.error ?? 'unknown error'),
            testedAt: testedAt.toISOString(),
          });
        }
      }
    });

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
    const db = getDb();
    const userId = session.user.id;
    const tenantId = await requireTenantIdForUser(userId, db);
    const [oldSettings] = await db
      .select({
        aiApiKeys: schema.userSettings.aiApiKeys,
        aiApiKeysUpdatedAt: schema.userSettings.aiApiKeysUpdatedAt,
      })
      .from(schema.userSettings)
      .where(and(eq(schema.userSettings.userId, userId), eq(schema.userSettings.tenantId, tenantId)));
    const oldDecrypted = oldSettings?.aiApiKeys ? decryptByok(oldSettings.aiApiKeys) : null;
    const oldUpdatedAt = oldSettings?.aiApiKeysUpdatedAt ?? {};

    // Preservation invariant: the chat providers and finnhub have no inputs
    // in this form — start from the stored payload and only touch Jev keys.
    const keys: ByokPayload = { ...(oldDecrypted ?? {}) };
    const newUpdatedAt = { ...oldUpdatedAt };
    const now = new Date().toISOString();
    let savedCount = 0;
    let clearedCount = 0;

    for (const id of JEV_PROVIDER_IDS) {
      const raw = formData.get(id);
      // An absent field preserves the stored key (older clients, partial posts).
      if (raw === null) continue;
      const value = typeof raw === 'string' ? raw.trim() : '';
      // The prefilled sentinel means "leave the stored key as-is".
      if (value === JEV_DECISION_KEY_KEEP) continue;
      const oldKey = oldDecrypted?.[id];
      if (value.length === 0) {
        if (oldKey) {
          delete keys[id];
          delete newUpdatedAt[id];
          clearedCount += 1;
        }
        continue;
      }
      if (value !== oldKey) {
        keys[id] = value;
        newUpdatedAt[id] = now;
      }
      savedCount += 1;
    }

    await db
      .update(schema.userSettings)
      .set({
        aiApiKeys: Object.keys(keys).length > 0 ? encryptByok(keys) : null,
        aiApiKeysUpdatedAt: Object.keys(newUpdatedAt).length > 0 ? newUpdatedAt : null,
      })
      .where(and(eq(schema.userSettings.userId, userId), eq(schema.userSettings.tenantId, tenantId)));

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
