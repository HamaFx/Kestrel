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

// Shared query helpers for fetching user settings + user row in one call.
// In hosted SaaS mode, operator-level AI & market feed settings (API keys,
// model routing, fallback chain, agent overrides, disabled tools, market data
// adapter) configured by the primary Admin account automatically propagate as
// platform defaults to all subscribers.
//
// the inheritance source is another tenant's row, so
// `getPlatformAdminSettings` reads on the admin (BYPASSRLS) connection when
// `ADMIN_DATABASE_URL` is configured. Without it they skip the cross-tenant read — platform-owner
// inheritance degrades to "own settings only" — and warn once per process,
// because these helpers run on nearly every page via `getUserWithSettings`
// and must not take those pages down.

import { and, asc, eq } from 'drizzle-orm';

import { readFeatureFlag } from '@kestrel/shared';

import { getAdminDb, getDb, schema, type DbClient } from '../client';
import { requireTenantIdForUser } from '../tenant';

// Once per process (this module instance), not once per call: the degraded
// read happens on the request path of nearly every page.
let warnedMissingAdminDb = false;

function warnMissingAdminDbOnce(fnName: string): void {
  if (warnedMissingAdminDb) return;
  warnedMissingAdminDb = true;
  console.warn(
    `[db] ${fnName}: ADMIN_DATABASE_URL is not set — skipping cross-tenant ` +
      'user_settings reads. Platform-owner settings inheritance and the ' +
      'all-users spending-alert sweep require the admin connection; set ' +
      'ADMIN_DATABASE_URL to enable them.',
  );
}

export interface UserWithSettings {
  settings: typeof schema.userSettings.$inferSelect | null;
  user: {
    name: string | null;
    email: string | null;
    role?: string | null;
  } | null;
}

/**
 * Fetch the primary platform admin's `user_settings` row so non-admin
 * subscribers inherit operator-configured AI keys, model routing, market data
 * adapters, and tool switches without needing personal BYOK credentials.
 *
 * This reads another tenant's row by design: under the non-bypass application
 * role a tenant-scoped connection cannot see it. Runs on the admin
 * (BYPASSRLS) connection when `ADMIN_DATABASE_URL` is configured; without it
 * the cross-tenant read is skipped and `null` is returned, so pages keep
 * rendering (with inheritance degraded) instead of failing. A one-time
 * warning names the missing variable.
 *
 * @param db Optional client the caller already holds. Pass the admin client
 *   (e.g. the handle from `withAdminDb`), never a tenant-scoped one.
 */
export async function getPlatformAdminSettings(
  db?: DbClient,
): Promise<typeof schema.userSettings.$inferSelect | null> {
  if (!db && !process.env.ADMIN_DATABASE_URL) {
    warnMissingAdminDbOnce('getPlatformAdminSettings');
    return null;
  }
  const client = db ?? getAdminDb();
  const rows = await client
    .select({ settings: schema.userSettings })
    .from(schema.userSettings)
    .innerJoin(schema.users, eq(schema.users.id, schema.userSettings.userId))
    .where(eq(schema.users.role, 'admin'))
    .orderBy(asc(schema.users.createdAt))
    .limit(1);

  return rows[0]?.settings ?? null;
}

/**
 * Return the primary platform admin's user ID.
 */
export async function getPlatformAdminUserId(): Promise<string | null> {
  const db = getDb();
  const rows = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.role, 'admin'))
    .orderBy(asc(schema.users.createdAt))
    .limit(1);

  return rows[0]?.id ?? null;
}

/**
 * Fetch userSettings + basic user info (name, email, role) in parallel.
 * For non-admin subscribers, operator-controlled AI/model/feed fields fall back
 * to the platform admin's settings row when the admin connection allows the
 * cross-tenant read (see `getPlatformAdminSettings`).
 */
export async function getUserWithSettings(userId: string): Promise<UserWithSettings> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  const [settings, userRow, adminSettings] = await Promise.all([
    db
      .select()
      .from(schema.userSettings)
      .where(
        and(eq(schema.userSettings.userId, userId), eq(schema.userSettings.tenantId, tenantId)),
      )
      .then((rows) => rows[0] ?? null),
    db
      .select({
        name: schema.users.name,
        email: schema.users.email,
        role: schema.users.role,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .then((rows) => rows[0] ?? null),
    getPlatformAdminSettings(),
  ]);

  if (!settings) {
    return { settings: null, user: userRow };
  }

  // If this user is not an admin (or has not configured personal overrides),
  // inherit platform-level model routing, market feed adapter, and disabled
  // tool controls from the primary Admin settings row.
  //
  // Phase 1 (Task 1.2): the admin's stored BYOK vault is intentionally NOT
  // inherited by default. Sharing it silently let any self-registered account
  // spend the operator's provider quota. Non-admins must add their own key on
  // /settings/api-keys; an operator who genuinely wants a shared pool can set
  // ALLOW_SHARED_OPERATOR_KEYS=1. The per-user daily cap (maxDailyUsd) is also
  // never inherited, so an admin's higher ceiling cannot raise another
  // account's enforced limit.
  if (adminSettings && userRow?.role !== 'admin') {
    const inheritOperatorKeys = readFeatureFlag('ALLOW_SHARED_OPERATOR_KEYS');
    const merged: typeof schema.userSettings.$inferSelect = {
      ...settings,
      ...(inheritOperatorKeys
        ? {
            aiApiKeys: adminSettings.aiApiKeys ?? settings.aiApiKeys,
            aiApiKeysUpdatedAt: adminSettings.aiApiKeysUpdatedAt ?? settings.aiApiKeysUpdatedAt,
          }
        : {}),
      chatModel: adminSettings.chatModel ?? settings.chatModel,
      visionModel: adminSettings.visionModel ?? settings.visionModel,
      embeddingModel: adminSettings.embeddingModel ?? settings.embeddingModel,
      aiFallbackChain:
        adminSettings.aiFallbackChain && adminSettings.aiFallbackChain.length > 0
          ? adminSettings.aiFallbackChain
          : settings.aiFallbackChain,
      defaultModels: adminSettings.defaultModels ?? settings.defaultModels,
      agentModelOverrides: adminSettings.agentModelOverrides ?? settings.agentModelOverrides,
      disabledTools:
        adminSettings.disabledTools && adminSettings.disabledTools.length > 0
          ? adminSettings.disabledTools
          : settings.disabledTools,
      marketDataProvider: adminSettings.marketDataProvider ?? settings.marketDataProvider,
      defaultAnalysisMode: adminSettings.defaultAnalysisMode ?? settings.defaultAnalysisMode,
      showAgentOpinions: adminSettings.showAgentOpinions ?? settings.showAgentOpinions,
    };
    return { settings: merged, user: userRow };
  }

  return { settings, user: userRow };
}

/**
 * Fetch the user's OWN `user_settings` row with no platform-admin
 * inheritance merge.
 *
 * Credential-bearing surfaces (the BYOK vault editor on
 * `/settings/api-keys`) must read this instead of {@link getUserWithSettings}:
 * the merged row substitutes the platform admin's `aiApiKeys` for a
 * subscriber who has none, and decrypting that into an editable form would
 * hand every subscriber a copy of the operator's provider secrets.
 */
export async function getOwnUserSettings(
  userId: string,
): Promise<typeof schema.userSettings.$inferSelect | null> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  const rows = await db
    .select()
    .from(schema.userSettings)
    .where(and(eq(schema.userSettings.userId, userId), eq(schema.userSettings.tenantId, tenantId)));
  return rows[0] ?? null;
}

/**
 * Update a single field on the userSettings row for a given userId.
 * Uses a partial update so only the provided field is changed.
 */
export async function updateUserSettingsField<
  K extends keyof typeof schema.userSettings.$inferInsert,
>(userId: string, field: K, value: (typeof schema.userSettings.$inferInsert)[K]): Promise<void> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  await db
    .update(schema.userSettings)
    .set({ [field]: value } as Partial<typeof schema.userSettings.$inferInsert>)
    .where(and(eq(schema.userSettings.userId, userId), eq(schema.userSettings.tenantId, tenantId)));
}
