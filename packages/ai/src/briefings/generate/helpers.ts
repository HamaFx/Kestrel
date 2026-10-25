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

// Briefing data loading and calendar/currency helpers (DEC-05 split from
// generate.ts): read the source economic event and derive the ISO-week and
// memory-index symbol context used by the emit paths.

import { schema } from '@kestrel/db';
import type { EconomicEvent, EventCurrency, Importance, Symbol } from '@kestrel/shared';
import { eq } from 'drizzle-orm';

import { getDb } from '../../runtime/db';

export async function loadEvent(eventId: string): Promise<EconomicEvent | null> {
  const rows = await getDb()
    .select()
    .from(schema.economicEvents)
    .where(eq(schema.economicEvents.id, eventId))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    title: r.title,
    country: r.country,
    currency: (r.currency as EventCurrency | null) ?? null,
    importance: r.importance as Importance,
    date: r.date.getTime(),
    actual: r.actual,
    forecast: r.forecast,
    previous: r.previous,
    unit: r.unit,
    source: r.source,
  };
}

/** ISO-week key like "2026-W22" — stable across UTC days within the week. */
/** Exported for testing — ISO week key calculation. */
export function isoWeekKey(d: Date): string {
  // Algorithm from https://en.wikipedia.org/wiki/ISO_week_date#Algorithms
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week =
    1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return `${target.getUTCFullYear()}-W${week.toString().padStart(2, '0')}`;
}

/**
 * Map a CFD currency tag to one of our three supported pairs for the
 * briefing's memory-index symbol context. USD-driven events get pinned
 * to XAUUSD because gold is the most directly USD-exposed leg in our
 * scope.
 */
/** Exported for testing — maps currency to symbol for briefing context. */
export function symbolFromCurrency(currency: EventCurrency): Symbol {
  if (currency === 'EUR') return 'EURUSD';
  if (currency === 'GBP') return 'GBPUSD';
  return 'XAUUSD';
}
