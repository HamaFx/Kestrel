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

// Bulk journal import.
//
// The route used to hand-roll `diff / risk` with a ±0.1 threshold and cap
// every price at 5,000, which rejected every BTCUSDT trade and disagreed with
// the journal update path's ±0.05 classification. Both now come from the
// canonical `computeRMultiple` / `classifyTradeOutcome` in `@kestrel/ai`.

import { classifyTradeOutcome, computeRMultiple } from '@kestrel/ai';
import { requireTenantIdForUser, schema, withUserTenant } from '@kestrel/db';
import {
  ALL_SYMBOLS,
  assertValidTradeLevels,
  MAX_PRICE_VALUE,
  TradeSideSchema,
} from '@kestrel/shared';
import { z } from 'zod';

const JOURNAL_IMPORT_MAX_ROWS = 200;

const ImportRowSchema = z.object({
  symbol: z
    .string()
    .transform((value) => value.trim().toUpperCase())
    .refine((value) => ALL_SYMBOLS.includes(value), {
      error: 'Unsupported symbol',
    }),
  side: TradeSideSchema,
  // Absolute sanity bounds, not per-instrument bands: BTC quotes in the tens
  // of thousands and must survive the import. Exact nullability is preserved
  // from the previous contract.
  entry: z.number().min(0.1).max(MAX_PRICE_VALUE),
  stop: z.number().min(0.1).max(MAX_PRICE_VALUE).nullable().optional(),
  target: z.number().min(0.1).max(MAX_PRICE_VALUE).nullable().optional(),
  exit: z.number().min(0.1).max(MAX_PRICE_VALUE).nullable().optional(),
  size: z.number().min(0.01).max(1000).nullable().optional(),
  openedAt: z.int().min(946684800000).max(4102444800000), // 2000-2100
  closedAt: z.int().min(946684800000).max(4102444800000).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

export const JournalImportPayloadSchema = z.object({
  trades: z.array(ImportRowSchema).min(1).max(JOURNAL_IMPORT_MAX_ROWS),
});

export type JournalImportTrade = z.infer<typeof ImportRowSchema>;

function badRequest(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 400 });
}

/**
 * Validate and insert an imported batch inside the user's tenant scope.
 * Returns the number of rows created.
 */
export async function importJournalEntriesService(
  userId: string,
  trades: readonly JournalImportTrade[],
): Promise<{ count: number }> {
  const rows = trades.map((trade, index) => {
    try {
      assertValidTradeLevels({
        side: trade.side,
        entry: trade.entry,
        stop: trade.stop,
        target: trade.target,
        exit: trade.exit,
      });
    } catch (err) {
      throw badRequest(`Trade ${index + 1}: ${err instanceof Error ? err.message : String(err)}`);
    }

    const exit = trade.exit ?? null;
    const closedAt =
      trade.closedAt !== null && trade.closedAt !== undefined ? new Date(trade.closedAt) : null;

    let outcome: 'win' | 'loss' | 'breakeven' | 'open' = 'open';
    let rMultiple: number | null = null;

    // journal_outcome_closed_consistency (migration 0028) requires outcome to
    // be 'open' when closedAt is NULL.
    if (closedAt !== null && exit !== null && trade.stop !== null && trade.stop !== undefined) {
      rMultiple = computeRMultiple({
        side: trade.side,
        entry: trade.entry,
        stop: trade.stop,
        exit,
      });
      outcome = classifyTradeOutcome(rMultiple);
    }

    return {
      symbol: trade.symbol,
      side: trade.side,
      entry: trade.entry,
      stop: trade.stop ?? null,
      target: trade.target ?? null,
      exit,
      size: trade.size ?? null,
      openedAt: new Date(trade.openedAt),
      closedAt,
      outcome,
      rMultiple,
      notes: trade.notes ?? null,
    };
  });

  return withUserTenant(userId, async (db) => {
    const tenantId = await requireTenantIdForUser(userId, db);
    const created = await db
      .insert(schema.journalEntries)
      .values(rows.map((row) => ({ ...row, userId, tenantId })))
      .returning({ id: schema.journalEntries.id });
    return { count: created.length };
  });
}
