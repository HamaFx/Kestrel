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

// Inbound tick handling for the BiQuote SignalR consumer: validates raw
// ticks against the BiquoteSignalRTick schema, drops symbols outside the
// canonical catalog, normalises to the LiveTick-shaped DTO, and reports
// rejection reasons on the consumer's logger.

import { BiquoteSignalRTickSchema, isKnownSymbol, symbolCategory } from '@kestrel/shared';

import type { Logger } from '../../log.js';
import type { NormalizedTick } from './types.js';

export function isBiquoteSymbol(symbol: string): boolean {
  if (!isKnownSymbol(symbol)) return false;
  const category = symbolCategory(symbol);
  return category === 'gold' || category === 'forex';
}

/**
 * Handle one raw tick. Validates against BiquoteSignalRTickSchema,
 * drops if the symbol isn't in the canonical catalog, normalises to a
 * LiveTick-shaped DTO, and returns it for dispatch to `onTick`. Returns
 * null when the tick is rejected or skipped.
 */
export function normalizeIncomingTick(raw: unknown, log: Logger): NormalizedTick | null {
  const parsed = BiquoteSignalRTickSchema.safeParse(raw);
  if (!parsed.success) {
    // Log the raw payload's keys (NOT values — they may contain bid/ask
    // info we'd rather not splatter). The first time we see a new shape
    // this catches it.
    const keys =
      raw !== null && typeof raw === 'object' ? Object.keys(raw as Record<string, unknown>) : [];
    log.warn('signalr tick rejected: invalid shape', {
      issues: parsed.error.issues.slice(0, 3).map((i) => i.path.join('.')),
      observedKeys: keys.slice(0, 12),
    });
    return null;
  }

  const tick = parsed.data;
  if (!isKnownSymbol(tick.symbol)) {
    // BiQuote pushes ticks for all subscribed symbols; in theory we never
    // see ticks for symbols we didn't subscribe to, but skip silently
    // if a stray tick arrives (e.g. mid-resubscribe race).
    return null;
  }

  const ts = parseTickTimestamp(tick.timestamp);
  if (ts === null) {
    log.warn('signalr tick rejected: bad timestamp', {
      timestamp: String(tick.timestamp).slice(0, 60),
    });
    return null;
  }

  const mid = (tick.bid + tick.ask) / 2;
  return {
    symbol: tick.symbol,
    bid: tick.bid,
    ask: tick.ask,
    mid,
    ts,
    source: 'biquote-signalr',
  };
}

/**
 * Parse a SignalR tick's `timestamp` field. Accepts:
 *   - number: ms epoch UTC, returned as-is.
 *   - string: ISO-8601 UTC; runs through `Date.parse` and returns ms epoch.
 * Returns null on un-parseable input.
 */
function parseTickTimestamp(input: number | string): number | null {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0) return null;
    // Heuristic: if the number is small (< 1e12), assume seconds and
    // promote to ms. BiQuote pushes ms, but defending against any future
    // server-side format change is cheap.
    return input < 1_000_000_000_000 ? input * 1000 : input;
  }
  const t = Date.parse(input);
  return Number.isNaN(t) ? null : t;
}
