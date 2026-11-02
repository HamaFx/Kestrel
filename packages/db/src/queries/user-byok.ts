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

// Single writer for the user BYOK vault (`user_settings.ai_api_keys` and its
// per-provider `ai_api_keys_updated_at` map).
//
// Every save, import, clear, and onboarding merge previously hand-rolled the
// decrypt → merge → delete → re-encrypt → update sequence. Each copy had a
// different preservation rule, and several could wipe keys the caller did not
// intend to touch. The invariant here is the opposite: a patch only changes
// the providers it names. `replace` is the one explicit way to drop stored
// keys that the patch does not mention.

import type { ByokPayload } from '@kestrel/shared/encryption';
import { and, eq } from 'drizzle-orm';

import { getDb, schema, type DbClient } from '../client';
import { requireTenantIdForUser } from '../tenant';

/** Decrypted vault contents plus the stored per-provider change times. */
export interface UserByokState {
  keys: ByokPayload;
  updatedAt: Record<string, string>;
}

/**
 * Providers to add, replace, or (with an empty value) remove. An omitted
 * provider is left exactly as stored.
 */
export interface UserByokPatch {
  set?: Readonly<Record<string, string | null | undefined>>;
  remove?: readonly string[];
  /** Drop stored keys that neither `set` nor `preserve` names. */
  replace?: boolean;
  /** Providers carried forward even when `replace` is true. */
  preserve?: readonly string[];
}

export interface UserByokPatchResult extends UserByokState {
  /** Providers whose stored value changed (added, replaced, or removed). */
  changed: string[];
  removed: string[];
}

export interface MergeUserByokKeysOptions {
  /** Reuse a client (or transaction) the caller already holds. */
  db?: DbClient;
  /** Tenant the row belongs to; resolved from the user when omitted. */
  tenantId?: string;
  /** Timestamp written for changed keys; defaults to now. */
  changedAt?: string;
  /**
   * Run inside the same transaction as the vault write. Use for rows that
   * must commit with the keys (provider health results, audit rows).
   */
  afterWrite?: (tx: DbClient, result: UserByokPatchResult) => Promise<void>;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Apply a patch to an in-memory vault state. Pure so onboarding can merge
 * keys inside the settings upsert it already owns.
 */
export function applyUserByokPatch(
  state: UserByokState,
  patch: UserByokPatch,
  changedAt: string = new Date().toISOString(),
): UserByokPatchResult {
  const remove = new Set(patch.remove ?? []);
  const keys: Record<string, string> = {};

  if (patch.replace) {
    for (const id of patch.preserve ?? []) {
      const existing = state.keys[id as keyof ByokPayload];
      if (isNonEmptyString(existing)) keys[id] = existing;
    }
  } else {
    for (const [id, value] of Object.entries(state.keys)) {
      if (isNonEmptyString(value)) keys[id] = value;
    }
  }

  const changed: string[] = [];
  for (const [id, raw] of Object.entries(patch.set ?? {})) {
    if (remove.has(id)) continue;
    const value = raw?.trim() ?? '';
    if (value.length === 0) {
      if (keys[id] !== undefined) remove.add(id);
      continue;
    }
    if (keys[id] !== value) changed.push(id);
    keys[id] = value;
  }

  const removedSet = new Set<string>();
  const removed: string[] = [];
  if (patch.replace) {
    for (const [id, value] of Object.entries(state.keys)) {
      if (isNonEmptyString(value) && keys[id] === undefined) removedSet.add(id);
    }
  }
  for (const id of remove) {
    if (keys[id] === undefined) continue;
    delete keys[id];
    removedSet.add(id);
  }
  for (const id of removedSet) removed.push(id);

  const changedSet = new Set(changed);
  const updatedAt: Record<string, string> = {};
  for (const id of Object.keys(keys)) {
    updatedAt[id] = changedSet.has(id) ? changedAt : (state.updatedAt[id] ?? changedAt);
  }

  return { keys: keys as ByokPayload, updatedAt, changed, removed };
}

/** Read the user's vault inside their tenant scope. */
export async function readUserByokState(
  userId: string,
  db: DbClient = getDb(),
): Promise<UserByokState> {
  // Lazy so importing this query module does not pull the server-only
  // encryption module into every consumer (and every unit test) up front.
  const { decryptByok } = await import('@kestrel/shared/encryption');
  const tenantId = await requireTenantIdForUser(userId, db);
  const [row] = await db
    .select({
      aiApiKeys: schema.userSettings.aiApiKeys,
      aiApiKeysUpdatedAt: schema.userSettings.aiApiKeysUpdatedAt,
    })
    .from(schema.userSettings)
    .where(and(eq(schema.userSettings.userId, userId), eq(schema.userSettings.tenantId, tenantId)));

  return {
    keys: row?.aiApiKeys ? (decryptByok(row.aiApiKeys) ?? {}) : {},
    updatedAt: row?.aiApiKeysUpdatedAt ?? {},
  };
}

/**
 * Apply a patch and persist it atomically.
 *
 * Returns the resulting plaintext state so callers can decide which changed
 * keys still need a live provider health check.
 */
export async function mergeUserByokKeys(
  userId: string,
  patch: UserByokPatch,
  options: MergeUserByokKeysOptions = {},
): Promise<UserByokPatchResult> {
  const db = options.db ?? getDb();
  const tenantId = options.tenantId ?? (await requireTenantIdForUser(userId, db));
  const changedAt = options.changedAt ?? new Date().toISOString();
  const { decryptByok, encryptByok } = await import('@kestrel/shared/encryption');

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        aiApiKeys: schema.userSettings.aiApiKeys,
        aiApiKeysUpdatedAt: schema.userSettings.aiApiKeysUpdatedAt,
      })
      .from(schema.userSettings)
      .where(
        and(eq(schema.userSettings.userId, userId), eq(schema.userSettings.tenantId, tenantId)),
      );

    const result = applyUserByokPatch(
      {
        keys: row?.aiApiKeys ? (decryptByok(row.aiApiKeys) ?? {}) : {},
        updatedAt: row?.aiApiKeysUpdatedAt ?? {},
      },
      patch,
      changedAt,
    );

    await tx
      .update(schema.userSettings)
      .set({
        aiApiKeys: Object.keys(result.keys).length > 0 ? encryptByok(result.keys) : null,
        aiApiKeysUpdatedAt: Object.keys(result.updatedAt).length > 0 ? result.updatedAt : null,
      })
      .where(
        and(eq(schema.userSettings.userId, userId), eq(schema.userSettings.tenantId, tenantId)),
      );

    if (options.afterWrite) {
      await options.afterWrite(tx as unknown as DbClient, result);
    }
    return result;
  });
}

/** Remove one provider's key (and its timestamp) from the vault. */
export function removeUserByokKey(
  userId: string,
  providerId: string,
  options: MergeUserByokKeysOptions = {},
): Promise<UserByokPatchResult> {
  return mergeUserByokKeys(userId, { remove: [providerId] }, options);
}
