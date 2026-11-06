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

// Single write path for `user_settings` and the BYOK vault.
//
// Settings server actions and the admin platform-config API used to hand-roll
// the same tenant-scoped UPDATE plus merge/test/health-row sequence. These
// helpers keep field mapping, tenant resolution, provider tests, and health
// bookkeeping in one place so the two entry points cannot drift.

import { testProviderKey } from '@kestrel/ai';
import {
  deleteProviderTestResult,
  getDb,
  mergeUserByokKeys,
  readUserByokState,
  recordProviderTestResult,
  requireTenantIdForUser,
  schema,
  withUserTenant,
  type DbClient,
} from '@kestrel/db';
import type { ByokPayload, ProviderId } from '@kestrel/shared/encryption';
import { and, eq } from 'drizzle-orm';

/** Partial `user_settings` row accepted by {@link updateUserSettingsFields}. */
export type UserSettingsPatch = Partial<typeof schema.userSettings.$inferInsert>;

export interface UserSettingsWriteOptions {
  /** Reuse a client (or transaction) the caller already holds. */
  db?: DbClient;
  /** Tenant the row belongs to; resolved from the user when omitted. */
  tenantId?: string;
}

/**
 * Apply a partial `user_settings` update inside the user's tenant.
 *
 * Server actions call this with a `withUserTenant` client; the admin
 * platform-config API passes its resolved client and tenant explicitly.
 */
export async function updateUserSettingsFields(
  userId: string,
  patch: UserSettingsPatch,
  options: UserSettingsWriteOptions = {},
): Promise<void> {
  if (Object.keys(patch).length === 0) return;

  const db = options.db ?? getDb();
  const tenantId = options.tenantId ?? (await requireTenantIdForUser(userId, db));
  await db
    .update(schema.userSettings)
    .set(patch)
    .where(and(eq(schema.userSettings.userId, userId), eq(schema.userSettings.tenantId, tenantId)));
}

export interface UserApiKeyPatch {
  set?: Readonly<Record<string, string>>;
  remove?: readonly string[];
}

export interface UserApiKeyCheck {
  id: string;
  action: 'upsert' | 'delete';
  ok: boolean;
  error: string | null;
}

export interface ApplyUserApiKeyPatchOptions extends UserSettingsWriteOptions {
  /** Stored vault contents when the caller already read them in scope. */
  before?: ByokPayload;
  /** Test values even when they match the stored key (admin save path). */
  testUnchanged?: boolean;
}

export interface ApplyUserApiKeyPatchResult {
  keys: ByokPayload;
  checks: UserApiKeyCheck[];
  testedAt: Date;
}

/**
 * Test changed provider keys without touching the database.
 *
 * Server actions call this between a scoped read and a scoped write so no
 * transaction is held open during provider network I/O (STAB-10).
 */
export async function testUserApiKeyPatch(
  before: ByokPayload,
  patch: UserApiKeyPatch,
  options: Pick<ApplyUserApiKeyPatchOptions, 'testUnchanged'> = {},
): Promise<UserApiKeyCheck[]> {
  const checks: UserApiKeyCheck[] = [];

  for (const [id, value] of Object.entries(patch.set ?? {})) {
    if (!options.testUnchanged && value === before[id as ProviderId]) continue;
    const result = await testProviderKey(id as ProviderId, value);
    checks.push({
      id,
      action: 'upsert',
      ok: result.ok,
      error: result.ok ? null : (result.error ?? 'unknown error'),
    });
  }

  for (const id of patch.remove ?? []) {
    checks.push({ id, action: 'delete', ok: true, error: null });
  }

  return checks;
}

/** Apply a tested patch to the vault and record its health rows atomically. */
export async function writeUserApiKeyPatch(
  userId: string,
  patch: UserApiKeyPatch,
  checks: readonly UserApiKeyCheck[],
  options: UserSettingsWriteOptions = {},
): Promise<ByokPayload> {
  const db = options.db ?? getDb();
  const scope = options.tenantId ? { tenantId: options.tenantId } : {};
  const changedAt = new Date();

  const merged = await mergeUserByokKeys(userId, patch, {
    db,
    ...scope,
    changedAt: changedAt.toISOString(),
    afterWrite: async (tx) => {
      for (const check of checks) {
        if (check.action === 'upsert') {
          await recordProviderTestResult(
            userId,
            { providerId: check.id, ok: check.ok, error: check.error },
            { db: tx, ...scope, testedAt: changedAt },
          );
        } else {
          await deleteProviderTestResult(userId, check.id, { db: tx, ...scope });
        }
      }
    },
  });

  return merged.keys;
}

/** Read the user's vault in a tenant scope before a write. */
export async function readUserApiKeyState(userId: string): Promise<ByokPayload> {
  const state = await withUserTenant(userId, (db) => readUserByokState(userId, db));
  return state.keys;
}

/**
 * Read, test, and write a BYOK patch in one call. Use the split helpers when
 * the caller must keep network I/O outside a transaction.
 */
export async function applyUserApiKeyPatch(
  userId: string,
  patch: UserApiKeyPatch,
  options: ApplyUserApiKeyPatchOptions = {},
): Promise<ApplyUserApiKeyPatchResult> {
  const db = options.db ?? getDb();
  const before = options.before ?? (await readUserByokState(userId, db)).keys;
  const testedAt = new Date();
  const checks = await testUserApiKeyPatch(before, patch, options);
  const keys = await writeUserApiKeyPatch(userId, patch, checks, {
    db,
    ...(options.tenantId ? { tenantId: options.tenantId } : {}),
  });

  return { keys, checks, testedAt };
}
