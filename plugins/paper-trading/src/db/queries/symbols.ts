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

// Paper Trading watched-symbol queries.
//
// Callers are always inside a tenant transaction (chat tool, plugin API,
// worker TickBus/job) and every query additionally filters by user_id.

import { getDb } from '@kestrel/db';
import { and, eq } from 'drizzle-orm';

import { paperOrders, paperPositions } from '../tables';

/** Distinct symbols with an open position or pending order for this user. */
export async function listWatchedSymbols(userId: string): Promise<string[]> {
  const db = getDb();
  const [positionSymbols, orderSymbols] = await Promise.all([
    db
      .selectDistinct({ symbol: paperPositions.symbol })
      .from(paperPositions)
      .where(and(eq(paperPositions.userId, userId), eq(paperPositions.status, 'open'))),
    db
      .selectDistinct({ symbol: paperOrders.symbol })
      .from(paperOrders)
      .where(and(eq(paperOrders.userId, userId), eq(paperOrders.status, 'pending'))),
  ]);
  return [...new Set([...positionSymbols, ...orderSymbols].map((row) => row.symbol))];
}
