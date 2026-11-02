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

// Provider health test query helpers.
//
// `recordProviderTestResult` and `replaceProviderTestResults` are the single
// writers for `provider_tests`. Every surface that tests a provider key (the
// settings save action, the bulk stream, the admin platform config, the
// test-provider route) goes through them instead of hand-rolling
// delete-then-insert, which previously drifted between callers.

import { and, eq } from 'drizzle-orm';

import { getDb, schema, type DbClient } from '../client';
import { requireTenantIdForUser } from '../tenant';
import { getPlatformAdminSettings } from './user-settings';

const providerTests = schema.providerTests;

/** Rate-limit snapshot returned by a provider health probe. */
export type ProviderTestRateLimit = NonNullable<typeof providerTests.$inferInsert.rateLimit>;

export interface ProviderTestRecord {
  providerId: string;
  ok: boolean;
  error?: string | null;
  rateLimit?: ProviderTestRateLimit | null;
}

export interface ProviderTestScope {
  /** Reuse a client (or transaction) the caller already holds. */
  db?: DbClient;
  /** Tenant the rows belong to; resolved from the user when omitted. */
  tenantId?: string;
  /** Timestamp shared by a batch of rows; defaults to now. */
  testedAt?: Date | string;
}

function toIsoTimestamp(value: Date | string | undefined): string {
  if (!value) return new Date().toISOString();
  return typeof value === 'string' ? value : value.toISOString();
}

async function resolveScope(
  userId: string,
  scope: ProviderTestScope,
): Promise<{ db: DbClient; tenantId: string; testedAt: string }> {
  const db = scope.db ?? getDb();
  const tenantId = scope.tenantId ?? (await requireTenantIdForUser(userId, db));
  return { db, tenantId, testedAt: toIsoTimestamp(scope.testedAt) };
}

function toInsertRow(
  userId: string,
  tenantId: string,
  testedAt: string,
  record: ProviderTestRecord,
): typeof providerTests.$inferInsert {
  return {
    userId,
    tenantId,
    providerId: record.providerId,
    ok: record.ok,
    error: record.ok ? null : (record.error ?? 'unknown error'),
    testedAt,
    rateLimit: record.rateLimit ?? null,
  };
}

/**
 * Replace the stored health result for one (user, provider).
 *
 * The table's primary key is (user_id, provider_id), so re-testing must
 * overwrite rather than accumulate history. Runs in a transaction so a
 * concurrent batch write cannot leave the row deleted without a replacement.
 */
export async function recordProviderTestResult(
  userId: string,
  record: ProviderTestRecord,
  scope: ProviderTestScope = {},
): Promise<void> {
  const { db, tenantId, testedAt } = await resolveScope(userId, scope);
  await db.transaction(async (tx) => {
    await tx
      .delete(providerTests)
      .where(
        and(
          eq(providerTests.userId, userId),
          eq(providerTests.tenantId, tenantId),
          eq(providerTests.providerId, record.providerId),
        ),
      );
    await tx.insert(providerTests).values(toInsertRow(userId, tenantId, testedAt, record));
  });
}

/**
 * Replace every stored health result for a user with the supplied batch.
 *
 * Used by the bulk health check, which tests the configured providers in one
 * pass and treats the batch as the complete current picture.
 */
export async function replaceProviderTestResults(
  userId: string,
  records: readonly ProviderTestRecord[],
  scope: ProviderTestScope = {},
): Promise<void> {
  const { db, tenantId, testedAt } = await resolveScope(userId, scope);
  await db.transaction(async (tx) => {
    await tx
      .delete(providerTests)
      .where(and(eq(providerTests.userId, userId), eq(providerTests.tenantId, tenantId)));
    if (records.length === 0) return;
    await tx
      .insert(providerTests)
      .values(records.map((record) => toInsertRow(userId, tenantId, testedAt, record)));
  });
}

/** Remove the stored health result for one provider (key cleared). */
export async function deleteProviderTestResult(
  userId: string,
  providerId: string,
  scope: Omit<ProviderTestScope, 'testedAt'> = {},
): Promise<void> {
  const db = scope.db ?? getDb();
  const tenantId = scope.tenantId ?? (await requireTenantIdForUser(userId, db));
  await db
    .delete(providerTests)
    .where(
      and(
        eq(providerTests.userId, userId),
        eq(providerTests.tenantId, tenantId),
        eq(providerTests.providerId, providerId),
      ),
    );
}

/**
 * Get the latest health test results for all providers for a user.
 * Returns the Drizzle-inferred row type from the select query.
 */
export async function getProviderHealthForUser(userId: string) {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  return db
    .select({
      providerId: schema.providerTests.providerId,
      ok: schema.providerTests.ok,
      error: schema.providerTests.error,
      testedAt: schema.providerTests.testedAt,
    })
    .from(schema.providerTests)
    .where(
      and(eq(schema.providerTests.userId, userId), eq(schema.providerTests.tenantId, tenantId)),
    );
}

/**
 * Get the user's AI API keys (encrypted) from userSettings, falling back to
 * the platform Admin's configured keys in SaaS mode.
 */
export async function getUserApiKeys(userId: string): Promise<string | null> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  const [settings] = await db
    .select({ aiApiKeys: schema.userSettings.aiApiKeys })
    .from(schema.userSettings)
    .where(and(eq(schema.userSettings.userId, userId), eq(schema.userSettings.tenantId, tenantId)));
  const val = settings?.aiApiKeys;
  if (val != null && String(val).trim().length > 0) {
    return String(val);
  }
  const adminSettings = await getPlatformAdminSettings();
  const adminVal = adminSettings?.aiApiKeys;
  return adminVal != null ? String(adminVal) : null;
}
