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

// Shared helpers for the deterministic Telegram data commands.

import { withTenantDb } from '@kestrel/db';
import { paperPositions } from '@kestrel/plugin-paper-trading/db/tables';
import { and, desc, eq } from 'drizzle-orm';

import type { TelegramBotContext } from '../types';

export const DEFAULT_WEB_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kestrel.ai';

export function bullet(label: string, value: string): string {
  return `${label}: ${value}`;
}

export function formatMoney(value: number): string {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function formatDayTime(value: Date | number | string): string {
  return new Date(value).toLocaleString('en-GB', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

export interface TelegramPaperPosition {
  symbol: string;
  side: string;
  quantity: number;
  entryPrice: number;
  unrealizedPnl: number;
}

/**
 * DEC-03 — the Telegram plugin reads open positions from the canonical
 * Paper Trading plugin tables inside a tenant-scoped transaction. Kestrel's
 * legacy core portfolio no longer exists.
 */
export async function listOpenPaperPositions(
  ctx: TelegramBotContext,
): Promise<TelegramPaperPosition[]> {
  return withTenantDb(
    ctx.tenantId,
    async (db) =>
      db
        .select({
          symbol: paperPositions.symbol,
          side: paperPositions.side,
          quantity: paperPositions.quantity,
          entryPrice: paperPositions.entryPrice,
          unrealizedPnl: paperPositions.unrealizedPnl,
        })
        .from(paperPositions)
        .where(and(eq(paperPositions.userId, ctx.userId), eq(paperPositions.status, 'open')))
        .orderBy(desc(paperPositions.entryTime))
        .limit(20),
    { userId: ctx.userId },
  );
}
