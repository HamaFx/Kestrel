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

import { listOpenPositions } from '@kestrel/plugin-paper-trading/db/queries';

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
 * DEC-03 — the Telegram plugin reads open positions through the Paper Trading
 * plugin's canonical query API. The webhook route already holds the install's
 * tenant scope, and the query filters by user and `status = 'open'`.
 */
export async function listOpenPaperPositions(
  ctx: TelegramBotContext,
): Promise<TelegramPaperPosition[]> {
  const rows = await listOpenPositions(ctx.userId);
  return rows.slice(0, 20).map((position) => ({
    symbol: position.symbol,
    side: position.side,
    quantity: position.quantity,
    entryPrice: position.entryPrice,
    unrealizedPnl: position.unrealizedPnl,
  }));
}
