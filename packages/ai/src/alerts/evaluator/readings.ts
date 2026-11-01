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
//
// R8 (audit 2026-10-31): readings refused when the market data is stale, so an
// alert can never fire on a cached-after-failure quote or a window whose last
// closed bar is days old. The refusal is logged, not silent.

import {
  candlesAgeSeconds,
  getCandles,
  getPrice,
  priceAgeSeconds,
  type CandlesResult,
  type PriceResult,
} from '@kestrel/data';
import { computeIndicator } from '@kestrel/indicators';
import {
  msPerTimeframe,
  type AlertRule,
  type Candle,
  type Symbol,
  type Timeframe,
} from '@kestrel/shared';
import { createCategorizedLogger } from '@kestrel/shared/logger';

import type { RuleReading } from '../spec';
import { lastClosedBar } from './bars';
import { parseIndicatorSpec } from './indicator-spec';

const rlog = createCategorizedLogger('ai', { component: 'alerts-readings' });

/**
 * A priceCross reading whose total age (provider quote age + cache time)
 * exceeds this is not evaluated. Five minutes matches the paper broker's
 * tradability gate so "live quote" means one thing across the product.
 */
export const ALERT_MAX_PRICE_AGE_SECONDS = 300;

/**
 * A candleClose/indicatorCross reading whose newest fully closed bar is older
 * than this many bar durations (with a 15-minute floor for intraday
 * timeframes) is not evaluated. The floor keeps 1m/5m rules alive between
 * prints; the multiple absorbs provider latency and short market pauses while
 * still refusing Friday's bar on Sunday.
 */
export const ALERT_MAX_CLOSED_BAR_AGE_BARS = 5;

export function alertCandleAgeLimitSeconds(tf: Timeframe): number {
  return Math.max((msPerTimeframe(tf) * ALERT_MAX_CLOSED_BAR_AGE_BARS) / 1000, 15 * 60);
}

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
  const priceCache = new Map<Symbol, PriceResult | Error>();
  const candleCache = new Map<string, CandlesResult | Error>();

  const fetches: Promise<void>[] = [];

  for (const sym of neededPrices) {
    fetches.push(
      getPrice(sym)
        .then((r) => {
          priceCache.set(sym, r);
        })
        .catch((e) => {
          priceCache.set(sym, e instanceof Error ? e : new Error(String(e)));
        }),
    );
  }
  for (const [key, req] of neededCandles.entries()) {
    fetches.push(
      getCandles(req.symbol, req.tf, { count: req.count })
        .then((r) => {
          candleCache.set(key, r);
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
        const result = priceCache.get(rule.symbol);
        if (result instanceof Error) throw result;
        if (!result) {
          results.set(a.id, null);
          continue;
        }
        // R8 — refuse stale readings instead of firing an alert on them.
        const stale = result.stale || result.tick.stale === true;
        const ageSeconds = priceAgeSeconds(result);
        if (stale || ageSeconds > ALERT_MAX_PRICE_AGE_SECONDS) {
          rlog.warn('alert reading skipped: price is stale', {
            alertId: a.id,
            symbol: rule.symbol,
            stale,
            ageSeconds,
          });
          results.set(a.id, null);
          continue;
        }
        results.set(a.id, { value: result.tick.mid, source: result.tick.source });
      } else if (rule.type === 'candleClose') {
        const key = `${rule.symbol}-${rule.tf}`;
        const result = candleCache.get(key);
        if (result instanceof Error) throw result;
        if (!result || result.candles.length === 0) {
          results.set(a.id, null);
          continue;
        }
        if (!candleWindowIsFresh(result, rule.tf, a.id, rule.symbol)) {
          results.set(a.id, null);
          continue;
        }
        const last = lastClosedBar(result.candles, rule.tf);
        if (!last) results.set(a.id, null);
        else results.set(a.id, { value: last.c, source: last.source });
      } else if (rule.type === 'indicatorCross') {
        const parsed = parseIndicatorSpec(rule.indicator);
        if (!parsed) {
          results.set(a.id, null);
          continue;
        }
        const key = `${rule.symbol}-${rule.tf}`;
        const result = candleCache.get(key);
        if (result instanceof Error) throw result;
        if (!result || result.candles.length === 0) {
          results.set(a.id, null);
          continue;
        }
        if (!candleWindowIsFresh(result, rule.tf, a.id, rule.symbol)) {
          results.set(a.id, null);
          continue;
        }
        const candles = result.candles;

        const result2 = computeIndicator({
          symbol: rule.symbol,
          tf: rule.tf,
          kind: parsed.kind,
          params: parsed.params,
          candles,
        });

        let found: RuleReading | null = null;
        for (let i = result2.values.length - 1; i >= 0; i -= 1) {
          const v = result2.values[i];
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

/**
 * R8 staleness gate for candle-driven rules: the window must not be a
 * stale-while-revalidate fallback, and its newest fully closed bar must not be
 * older than `alertCandleAgeLimitSeconds(tf)`.
 */
function candleWindowIsFresh(
  result: CandlesResult,
  tf: Timeframe,
  alertId: string,
  symbol: Symbol,
): boolean {
  const ageSeconds = newestClosedBarAgeSeconds(result.candles, tf);
  const fresh =
    !result.stale && ageSeconds !== null && ageSeconds <= alertCandleAgeLimitSeconds(tf);
  if (!fresh) {
    rlog.warn('alert reading skipped: candle window is stale', {
      alertId,
      symbol,
      tf,
      cacheStale: result.stale,
      cacheAgeSeconds: candlesAgeSeconds(result),
      lastClosedBarAgeSeconds: ageSeconds,
    });
  }
  return fresh;
}

/** Seconds since the newest fully closed bar closed; null when none is closed. */
function newestClosedBarAgeSeconds(candles: readonly Candle[], tf: Timeframe): number | null {
  const tfDur = msPerTimeframe(tf);
  const now = Date.now();
  for (let i = candles.length - 1; i >= 0; i -= 1) {
    const bar = candles[i]!;
    if (bar.t + tfDur <= now) return (now - (bar.t + tfDur)) / 1000;
  }
  return null;
}
