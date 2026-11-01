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

// Telegram update ledger — the atomic half of webhook idempotency.
//
// Telegram retries an update when the first delivery is still in flight (the
// handler may legitimately run for up to 85s of AI work). The old check-then-
// process-then-set used `plugin_storage` as a read-then-write, so two
// concurrent deliveries of the same `update_id` both passed the check and both
// ran the prompt, double-spending AI budget.
//
// `plugin_storage`'s primary key `(tenant_id, user_id, plugin_id, collection,
// key)` already expresses the claim: with `collection = 'updates'` and
// `key = <update_id>` exactly one row per update can exist. The claim is a
// single `INSERT … ON CONFLICT DO NOTHING RETURNING`, so the database — not a
// prior SELECT — decides which delivery proceeds. No migration is needed.
//
// The completion write (`processedAt`) still goes through `PluginStorage.set`,
// and the failure path deletes the row so Telegram's retry can run the update
// again (the same behaviour as before, just claimed atomically).

import { getDb, schema } from '@kestrel/db';
import { and, eq, sql } from 'drizzle-orm';

/** `plugin_storage` collection holding the per-update ledger. */
export const UPDATE_COLLECTION = 'updates';

/**
 * How long a claimed-but-unprocessed update is protected from a second
 * delivery. It must exceed the webhook handler's own budget (85s) so a live
 * handler is never treated as stale, and it should stay short enough that an
 * update whose process died mid-handler is still retried by Telegram.
 */
export const UPDATE_CLAIM_LEASE_MS = 2 * 60_000;

export interface TelegramUpdateClaimArgs {
  tenantId: string;
  userId: string;
  /** Plugin id owning the ledger row (`telegram-bot`). */
  pluginId: string;
  updateId: number;
  /** Injectable clock for tests. */
  now?: Date;
}

/**
 * Claim one Telegram update for processing.
 *
 * Returns true when this caller owns the update and must process it. Returns
 * false when another delivery of the same `update_id` holds a live claim or has
 * already processed it — the caller answers 200 and does nothing.
 *
 * Must run inside the install's tenant scope (`withTenantDb`): `plugin_storage`
 * is FORCE ROW LEVEL SECURITY.
 */
export async function claimTelegramUpdate(
  args: TelegramUpdateClaimArgs,
): Promise<{ claimed: boolean; reClaimed: boolean }> {
  const db = getDb();
  const claimedAt = args.now ?? new Date();
  const key = String(args.updateId);
  const target = [
    schema.pluginStorage.tenantId,
    schema.pluginStorage.userId,
    schema.pluginStorage.pluginId,
    schema.pluginStorage.collection,
    schema.pluginStorage.key,
  ];

  const inserted = await db
    .insert(schema.pluginStorage)
    .values({
      tenantId: args.tenantId,
      userId: args.userId,
      pluginId: args.pluginId,
      collection: UPDATE_COLLECTION,
      key,
      value: { claimedAt: claimedAt.toISOString(), claimedAtMs: claimedAt.getTime() },
    })
    .onConflictDoNothing({ target })
    .returning({ key: schema.pluginStorage.key });
  if (inserted.length > 0) return { claimed: true, reClaimed: false };

  // A row already exists. It is either a completed update, a live claim, or an
  // abandoned claim whose process died. Only the last is re-claimable, and the
  // steal is itself a single atomic UPDATE … WHERE … RETURNING: under READ
  // COMMITTED a second stealer re-evaluates the predicate after the row lock is
  // released and sees the refreshed timestamp, so exactly one wins.
  const staleBeforeMs = claimedAt.getTime() - UPDATE_CLAIM_LEASE_MS;
  const stolen = await db
    .update(schema.pluginStorage)
    .set({
      value: { claimedAt: claimedAt.toISOString(), claimedAtMs: claimedAt.getTime() },
      updatedAt: claimedAt,
    })
    .where(
      and(
        eq(schema.pluginStorage.tenantId, args.tenantId),
        eq(schema.pluginStorage.userId, args.userId),
        eq(schema.pluginStorage.pluginId, args.pluginId),
        eq(schema.pluginStorage.collection, UPDATE_COLLECTION),
        eq(schema.pluginStorage.key, key),
        sql`${schema.pluginStorage.value}->>'processedAt' IS NULL`,
        sql`coalesce((${schema.pluginStorage.value}->>'claimedAtMs')::bigint, 0) < ${staleBeforeMs}`,
      ),
    )
    .returning({ key: schema.pluginStorage.key });

  return { claimed: stolen.length > 0, reClaimed: stolen.length > 0 };
}
