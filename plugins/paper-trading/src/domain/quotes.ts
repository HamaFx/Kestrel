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

// Pure paper-broker domain — price/quote helpers.
//
// No database, no network, no clock: every function takes the state it needs
// and returns a decision. The services in `src/services/` persist those
// decisions. This split lets the money math be unit-tested exhaustively.

import { round } from './math';
import type { MarketTick, OrderSide, PaperPositionState, Quotes } from './types';

/**
 * Normalise a provider tick to a tradable bid/ask.
 *
 * Some providers return bid === ask (a mid-only quote). In that case we
 * synthesise a symmetric spread from the plugin settings so P&L is never
 * frictionless.
 *
 * R8 (audit 2026-10-31): a zero/near-zero or non-finite price is rejected,
 * not clamped to `1e-7`. Clamping invented a tradable quote where the feed
 * had none; callers must gate with `isTickTradable` first, and this throw is
 * the backstop for a price-free tick reaching the money math.
 */
export function quotesFromTick(tick: MarketTick, spread: number): Quotes {
  const rawMid = Number.isFinite(tick.mid) && tick.mid > 0 ? tick.mid : (tick.bid + tick.ask) / 2;
  if (!Number.isFinite(rawMid) || rawMid <= 0) {
    throw new Error(
      `Cannot build a quote for ${tick.symbol}: no usable price (bid ${tick.bid}, ask ${tick.ask}, mid ${tick.mid}).`,
    );
  }

  const half = Math.max(0, spread) / 2;
  const hasRealSpread = tick.bid > 0 && tick.ask > 0 && tick.ask > tick.bid;
  const bid = hasRealSpread ? tick.bid : rawMid - half;
  const ask = hasRealSpread ? tick.ask : rawMid + half;
  if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= bid) {
    throw new Error(
      `Cannot build a quote for ${tick.symbol}: spread ${spread} produces an invalid bid/ask (${bid}/${ask}).`,
    );
  }

  // Keep a minimum tick between the sides: identity/zero spreads still need a
  // two-sided market for the domain matcher.
  const MIN_QUOTE_INCREMENT = 1e-7;
  return {
    bid: round(bid, 8),
    ask: round(Math.max(bid + MIN_QUOTE_INCREMENT, ask), 8),
    mid: round((bid + ask) / 2, 8),
  };
}

/** Market fill price with adverse slippage. */
export function marketFillPrice(side: OrderSide, quotes: Quotes, slippage: number): number {
  const slip = Math.max(0, slippage);
  return round(side === 'buy' ? quotes.ask + slip : quotes.bid - slip, 8);
}

/** Exit price for a position (long sells the bid, short buys the ask). */
export function exitQuote(position: Pick<PaperPositionState, 'side'>, quotes: Quotes): number {
  return position.side === 'long' ? quotes.bid : quotes.ask;
}
