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

// ---------------------------------------------------------------------------
// Cron-handler queries
// ---------------------------------------------------------------------------

import { schema } from '@kestrel/db';
import { and, gte as dgte, isNotNull as disNotNull, lte as dlte, eq } from 'drizzle-orm';

import { getDb } from '../../runtime/db';

/**
 * Look up high-impact economic events whose `date` falls inside `[fromMs, toMs]`.
 * Used by /api/cron/briefings for both the pre-event window (now+30m ± 2m)
 * and the post-event window (now-30m ± 2m). Set `requireActual` to filter
 * to events whose `actual` column is non-null (post-event).
 */
export async function findHighImpactEventsInWindow(args: {
  fromMs: number;
  toMs: number;
  requireActual?: boolean;
}): Promise<{ id: string }[]> {
  const filters = [
    dgte(schema.economicEvents.date, new Date(args.fromMs)),
    dlte(schema.economicEvents.date, new Date(args.toMs)),
    eq(schema.economicEvents.importance, 'high'),
  ];
  if (args.requireActual) {
    filters.push(disNotNull(schema.economicEvents.actual));
  }
  const rows = await getDb()
    .select({ id: schema.economicEvents.id })
    .from(schema.economicEvents)
    .where(and(...filters));
  return rows;
}
