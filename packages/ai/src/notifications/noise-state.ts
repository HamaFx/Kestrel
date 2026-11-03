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

// F4 — Notification Noise Control configuration persistence.
//
// Noise config and route config are stored as JSONB in the existing
// user_settings table (notificationPreferences field). Dedup/cooldown state
// is process-local (`InMemoryNoiseState`) — there is no per-user state table.

import { requireTenantIdForUser, schema } from '@kestrel/db';
import {
  DEFAULT_NOISE_CONFIG,
  DEFAULT_ROUTE_CONFIG,
  type NoiseConfig,
  type RouteConfig,
} from '@kestrel/shared';
import { and, eq } from 'drizzle-orm';

import { getDb } from '../runtime/db';

// ---------------------------------------------------------------------------
// Noise config persistence — stored in user_settings.notificationPreferences
// ---------------------------------------------------------------------------

interface NotificationPreferencesWithNoise {
  noiseConfig?: NoiseConfig;
  routeConfig?: RouteConfig;
  // Existing notification prefs (event × channel matrix) are also here
  [key: string]: unknown;
}

export async function getNoiseConfig(userId: string): Promise<NoiseConfig> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  const rows = await db
    .select({ notificationPreferences: schema.userSettings.notificationPreferences })
    .from(schema.userSettings)
    .where(and(eq(schema.userSettings.userId, userId), eq(schema.userSettings.tenantId, tenantId)))
    .limit(1);

  const prefs = rows[0]?.notificationPreferences as NotificationPreferencesWithNoise | null;
  if (prefs?.noiseConfig) {
    return { ...DEFAULT_NOISE_CONFIG, ...prefs.noiseConfig };
  }
  return DEFAULT_NOISE_CONFIG;
}

export async function saveNoiseConfig(
  userId: string,
  config: Partial<NoiseConfig>,
): Promise<NoiseConfig> {
  const current = await getNoiseConfig(userId);
  const merged = { ...current, ...config };

  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  // Fetch current prefs, merge noise config, save back
  const rows = await db
    .select({ notificationPreferences: schema.userSettings.notificationPreferences })
    .from(schema.userSettings)
    .where(and(eq(schema.userSettings.userId, userId), eq(schema.userSettings.tenantId, tenantId)))
    .limit(1);

  const existing = (rows[0]?.notificationPreferences ?? {}) as NotificationPreferencesWithNoise;
  const updated: NotificationPreferencesWithNoise = {
    ...existing,
    noiseConfig: merged,
  };

  await db
    .insert(schema.userSettings)
    .values({
      userId,
      tenantId,
      notificationPreferences: updated,
    })
    .onConflictDoUpdate({
      target: schema.userSettings.userId,
      set: { tenantId, notificationPreferences: updated },
    });

  return merged;
}

export async function getRouteConfig(userId: string): Promise<RouteConfig> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  const rows = await db
    .select({ notificationPreferences: schema.userSettings.notificationPreferences })
    .from(schema.userSettings)
    .where(and(eq(schema.userSettings.userId, userId), eq(schema.userSettings.tenantId, tenantId)))
    .limit(1);

  const prefs = rows[0]?.notificationPreferences as NotificationPreferencesWithNoise | null;
  if (prefs?.routeConfig) {
    return { ...DEFAULT_ROUTE_CONFIG, ...prefs.routeConfig };
  }
  return DEFAULT_ROUTE_CONFIG;
}

export async function saveRouteConfig(
  userId: string,
  config: Partial<RouteConfig>,
): Promise<RouteConfig> {
  const current = await getRouteConfig(userId);
  const merged = { ...current, ...config };

  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  const rows = await db
    .select({ notificationPreferences: schema.userSettings.notificationPreferences })
    .from(schema.userSettings)
    .where(and(eq(schema.userSettings.userId, userId), eq(schema.userSettings.tenantId, tenantId)))
    .limit(1);

  const existing = (rows[0]?.notificationPreferences ?? {}) as NotificationPreferencesWithNoise;
  const updated: NotificationPreferencesWithNoise = {
    ...existing,
    routeConfig: merged,
  };

  await db
    .insert(schema.userSettings)
    .values({
      userId,
      tenantId,
      notificationPreferences: updated,
    })
    .onConflictDoUpdate({
      target: schema.userSettings.userId,
      set: { tenantId, notificationPreferences: updated },
    });

  return merged;
}
