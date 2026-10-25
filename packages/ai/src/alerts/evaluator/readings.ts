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

// Per-rule readings for the alert evaluator (DEC-05 split from evaluator.ts).
//
// All rule inputs (prices, candle windows) are grouped by (symbol, tf) and
// pre-fetched in parallel before each rule is evaluated purely from the
// prefetched cache, so a single tick never issues duplicated upstream calls.

import { getCandles, getPrice } from '@kestrel/data';
import { computeIndicator } from '@kestrel/indicators';
import type { AlertRule, Candle, Symbol, Tick, Timeframe } from '@kestrel/shared';

import type { RuleReading } from '../spec';
import { lastClosedBar } from './bars';
import { parseIndicatorSpec } from './indicator-spec';

type AlertObj = { id: string; rule: AlertRule };

export async function readReadingsBatch(
  alerts: AlertObj[],
): Promise<Map<string, RuleReading | null | Error>> {
  // 1. Group dependencies
  const neededPrices = new Set<Symbol>();
  const neededCandles = new Map<string, { symbol: Symbol; tf: Timeframe; count: number }>();

  for (const a of alerts) {
    const { rule } = a;
    if (rule.type === 'priceCross') neededPrices.add(rule.symbol);
    else if (rule.type === 'candleClose') {
      const key = `${rule.symbol}-${rule.tf}`;
      const existing = neededCandles.get(key);
      neededCandles.set(key, {
        symbol: rule.symbol,
        tf: rule.tf,
        count: Math.max(existing?.count ?? 0, 4),
      });
    } else if (rule.type === 'indicatorCross') {
      if (!parseIndicatorSpec(rule.indicator)) continue;
      const key = `${rule.symbol}-${rule.tf}`;
      const existing = neededCandles.get(key);
      neededCandles.set(key, {
        symbol: rule.symbol,
        tf: rule.tf,
        count: Math.max(existing?.count ?? 0, 250),
      });
    }
  }

  // 2. Pre-fetch all dependencies in parallel
  const priceCache = new Map<Symbol, Tick | Error>();
  const candleCache = new Map<string, Candle[] | Error>();

  const fetches: Promise<void>[] = [];

  for (const sym of neededPrices) {
    fetches.push(
      getPrice(sym)
        .then((t) => {
          priceCache.set(sym, t);
        })
        .catch((e) => {
          priceCache.set(sym, e instanceof Error ? e : new Error(String(e)));
        }),
    );
  }
  for (const [key, req] of neededCandles.entries()) {
    fetches.push(
      getCandles(req.symbol, req.tf, { count: req.count })
        .then((c) => {
          candleCache.set(key, c);
        })
        .catch((e) => {
          candleCache.set(key, e instanceof Error ? e : new Error(String(e)));
        }),
    );
  }

  await Promise.all(fetches);

  // 3. Evaluate each rule purely from the prefetched cache
  const results = new Map<string, RuleReading | null | Error>();

  for (const a of alerts) {
    const { rule } = a;
    try {
      if (rule.type === 'priceCross') {
        const tick = priceCache.get(rule.symbol);
        if (tick instanceof Error) throw tick;
        if (!tick) {
          results.set(a.id, null);
          continue;
        }
        results.set(a.id, { value: tick.mid, source: tick.source });
      } else if (rule.type === 'candleClose') {
        const key = `${rule.symbol}-${rule.tf}`;
        const candles = candleCache.get(key);
        if (candles instanceof Error) throw candles;
        if (!candles || candles.length === 0) {
          results.set(a.id, null);
          continue;
        }
        const last = lastClosedBar(candles, rule.tf);
        if (!last) results.set(a.id, null);
        else results.set(a.id, { value: last.c, source: last.source });
      } else if (rule.type === 'indicatorCross') {
        const parsed = parseIndicatorSpec(rule.indicator);
        if (!parsed) {
          results.set(a.id, null);
          continue;
        }
        const key = `${rule.symbol}-${rule.tf}`;
        const candles = candleCache.get(key);
        if (candles instanceof Error) throw candles;
        if (!candles || candles.length === 0) {
          results.set(a.id, null);
          continue;
        }

        const result = computeIndicator({
          symbol: rule.symbol,
          tf: rule.tf,
          kind: parsed.kind,
          params: parsed.params,
          candles,
        });

        let found: RuleReading | null = null;
        for (let i = result.values.length - 1; i >= 0; i -= 1) {
          const v = result.values[i];
          if (v == null) continue;
          if (typeof v === 'number') {
            found = { value: v, source: `${parsed.kind}@${rule.tf}` };
            break;
          }
          if (typeof v === 'object') {
            if ('macd' in v && typeof v.macd === 'number') {
              found = { value: v.macd, source: `macd@${rule.tf}` };
              break;
            }
            if ('middle' in v && typeof v.middle === 'number') {
              found = { value: v.middle, source: `bollinger.middle@${rule.tf}` };
              break;
            }
            if ('pp' in v && typeof v.pp === 'number') {
              found = { value: v.pp, source: `pivots.pp@${rule.tf}` };
              break;
            }
          }
        }
        results.set(a.id, found);
      }
    } catch (err) {
      results.set(a.id, err instanceof Error ? err : new Error(String(err)));
    }
  }

  return results;
}
