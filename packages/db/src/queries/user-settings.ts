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

import { and, asc, eq } from 'drizzle-orm';

import { getDb, schema } from '../client';
import { requireTenantIdForUser } from '../tenant';

export interface UserWithSettings {
  settings: typeof schema.userSettings.$inferSelect | null;
  user: {
    name: string | null;
    email: string | null;
    plan: string | null;
    role?: string | null;
  } | null;
}

/**
 * Fetch the primary platform admin's `user_settings` row so non-admin
 * subscribers inherit operator-configured AI keys, model routing, market data
 * adapters, and tool switches without needing personal BYOK credentials.
 */
export async function getPlatformAdminSettings(): Promise<
  typeof schema.userSettings.$inferSelect | null
> {
  const db = getDb();
  const rows = await db
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
 * Fetch userSettings + basic user info (name, email, plan, role) in parallel.
 * For non-admin subscribers, operator-controlled AI/model/feed fields fall back
 * to the platform admin's settings row.
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
        plan: schema.organization.plan,
      })
      .from(schema.users)
      .leftJoin(
        schema.organizationMember,
        and(
          eq(schema.organizationMember.userId, schema.users.id),
          eq(schema.organizationMember.orgId, tenantId),
        ),
      )
      .leftJoin(schema.organization, eq(schema.organization.id, schema.organizationMember.orgId))
      .where(eq(schema.users.id, userId))
      .then((rows) => rows[0] ?? null),
    getPlatformAdminSettings(),
  ]);

  if (!settings) {
    return { settings: null, user: userRow };
  }

  // If this user is not an admin (or has not configured personal overrides),
  // inherit platform-level AI keys, model routing, market feed adapter, and
  // disabled tool controls from the primary Admin settings row.
  if (adminSettings && userRow?.role !== 'admin') {
    const merged: typeof schema.userSettings.$inferSelect = {
      ...settings,
      aiApiKeys: adminSettings.aiApiKeys ?? settings.aiApiKeys,
      aiApiKeysUpdatedAt: adminSettings.aiApiKeysUpdatedAt ?? settings.aiApiKeysUpdatedAt,
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
      maxDailyUsd: adminSettings.maxDailyUsd ?? settings.maxDailyUsd,
    };
    return { settings: merged, user: userRow };
  }

  return { settings, user: userRow };
}

/**
 * List all user settings rows. Used by background job that checks
 * spending alerts across every user.
 */
export async function listAllUserSettings(): Promise<(typeof schema.userSettings.$inferSelect)[]> {
  const db = getDb();
  return db.select().from(schema.userSettings);
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
