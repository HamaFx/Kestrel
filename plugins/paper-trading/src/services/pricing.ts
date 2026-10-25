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

// Quote acquisition for the paper broker.
//
// Uses the same @kestrel/data failover/cache path as the rest of Kestrel; a
// mid-only provider is widened to a synthetic spread in the domain layer.

import { getPrice, getPrices } from '@kestrel/data';
import { pipSize, type Symbol } from '@kestrel/shared';

import type { MarketTick } from '../domain';
import type { PaperSettings } from '../settings';

export function spreadFor(symbol: string, settings: PaperSettings): number {
  return settings.spreadPips * pipSize(symbol);
}

export function slippageFor(symbol: string, settings: PaperSettings): number {
  return settings.slippagePips * pipSize(symbol);
}

export function toMarketTick(tick: {
  symbol: string;
  bid: number;
  ask: number;
  mid: number;
  ts: number;
  source?: string;
}): MarketTick {
  return {
    symbol: tick.symbol,
    bid: tick.bid,
    ask: tick.ask,
    mid: tick.mid,
    ts: tick.ts,
    ...(tick.source ? { source: tick.source } : {}),
  };
}

export async function loadTick(symbol: string, signal?: AbortSignal): Promise<MarketTick> {
  const tick = await getPrice(symbol as Symbol, signal ? { signal } : {});
  return toMarketTick(tick);
}

export async function loadTicks(
  symbols: readonly string[],
  signal?: AbortSignal,
): Promise<Map<string, MarketTick>> {
  const result = new Map<string, MarketTick>();
  if (symbols.length === 0) return result;
  try {
    const ticks = await getPrices(symbols as Symbol[], signal ? { signal } : {});
    for (const tick of ticks) result.set(tick.symbol, toMarketTick(tick));
  } catch {
    // Batch failure: fall back to per-symbol best effort so one bad symbol
    // does not strand every other position.
    await Promise.allSettled(
      symbols.map(async (symbol) => {
        try {
          result.set(symbol, await loadTick(symbol, signal));
        } catch {
          // ignored — the caller will skip symbols without a quote
        }
      }),
    );
  }
  return result;
}
