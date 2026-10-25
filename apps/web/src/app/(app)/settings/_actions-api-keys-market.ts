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

// Market-data provider selection action.
import { getDb } from '@kestrel/ai';
import { requireTenantIdForUser, schema, withRateLimit } from '@kestrel/db';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auth } from '@/auth';
import { logActionError } from '@/lib/http/action-errors';

import { type ActionResult } from './_actions-shared';

/**
 * Server action to update the selected market data provider.
 */
export async function updateMarketDataProviderAction(formData: FormData): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Unauthorized' };
  }

  const rl = await withRateLimit(session.user.id, 'settings_update_provider', 10);
  if (!rl.allowed) {
    return { ok: false as const, error: 'Too many requests. Try again later.' };
  }

  const provider = formData.get('marketDataProvider') as string;
  if (!provider || !['biquote', 'finnhub', 'live-ticks'].includes(provider)) {
    return { ok: false as const, error: 'Invalid provider selected' };
  }

  try {
    const db = getDb();
    const tenantId = await requireTenantIdForUser(session.user.id, db);
    await db
      .update(schema.userSettings)
      .set({
        marketDataProvider: provider,
      })
      .where(
        and(
          eq(schema.userSettings.userId, session.user.id),
          eq(schema.userSettings.tenantId, tenantId),
        ),
      );

    revalidatePath('/settings/api-keys');
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
