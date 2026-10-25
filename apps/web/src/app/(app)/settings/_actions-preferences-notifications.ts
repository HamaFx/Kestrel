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

// Notification preferences action: merges category toggles into the stored
// notification-preferences object.
import { getDb } from '@kestrel/ai';
import { requireTenantIdForUser, schema, withRateLimit } from '@kestrel/db';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auth } from '@/auth';
import { logActionError } from '@/lib/http/action-errors';

import { type ActionResult } from './_actions-shared';

/**
 * Server action to update notification preferences.
 */
export async function updateNotificationPrefsAction(
  prefs: Record<string, Record<string, boolean>>,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Unauthorized' };
  }

  const rl = await withRateLimit(session.user.id, 'settings_update_notification_prefs', 10);
  if (!rl.allowed) {
    return { ok: false as const, error: 'Too many requests. Try again later.' };
  }

  try {
    const db = getDb();
    const tenantId = await requireTenantIdForUser(session.user.id, db);
    // Merge with existing notification preferences to preserve nested
    // fields like noiseConfig that aren't managed through this action.
    const [existing] = await db
      .select({ notificationPreferences: schema.userSettings.notificationPreferences })
      .from(schema.userSettings)
      .where(
        and(
          eq(schema.userSettings.userId, session.user.id),
          eq(schema.userSettings.tenantId, tenantId),
        ),
      );
    const merged = {
      ...((existing?.notificationPreferences as Record<string, unknown>) || {}),
      ...prefs,
    };
    await db
      .update(schema.userSettings)
      .set({ notificationPreferences: merged as Record<string, Record<string, boolean>> })
      .where(
        and(
          eq(schema.userSettings.userId, session.user.id),
          eq(schema.userSettings.tenantId, tenantId),
        ),
      );

    revalidatePath('/settings');
    return { ok: true as const };
  } catch (err) {
    logActionError(err, 'settings-action');
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
