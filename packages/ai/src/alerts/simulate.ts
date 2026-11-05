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

/**
 * Alert rule simulator — "would this have fired historically?"
 *
 * Phase B — UX_UPGRADE_PLAN.md item 10.
 *
 * Pure function: takes a rule and a window of historical candles
 * (already fetched by the caller — this module does not touch
 * network or DB) and returns a list of firing timestamps. We
 * deliberately keep this minimal:
 *
 *   - priceCross: a candle fires if its [low, high] band straddles
 *     the level for the matching direction. "above" fires when the
 *     candle's high >= level; "below" fires when the candle's low
 *     <= level. This matches the live evaluator's behavior in
 *     packages/ai/src/alerts/evaluator/evaluate.ts.
 *   - candleClose: a candle fires if its close satisfies the rule.
 *   - indicatorCross: the indicator series is recomputed over the
 *     window and a candle fires when the value crosses the level
 *     (previous < level <= current for "above"), matching
 *     `CrossingSpec` in the live evaluator.
 *
 * Tested in packages/ai/test/alert-simulate.test.ts.
 */

import { computeIndicator } from '@kestrel/indicators';
import type { AlertRule, Candle } from '@kestrel/shared';

import { indicatorScalar } from './evaluator/indicator-value';
import { parseIndicatorSpec } from './evaluator/indicator-spec';
import { specFromRule } from './spec';

export interface SimCandle {
  /** Candle open time, ms since epoch. */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface SimFire {
  /** Candle time of the firing bar. */
  at: number;
  /** Price level the rule crossed. */
  price: number;
}

export interface SimResult {
  fires: SimFire[];
  /** Average hold time in ms between consecutive fires (0 when <2 fires). */
  avgHoldMs: number;
}

/**
 * Run the simulator over a candle window. The result is sorted
 * by `at` ascending and capped at `maxFires` to bound the response
 * size for the chat alert form (default 50).
 */
export function simulateAlert(
  rule: AlertRule,
  candles: readonly SimCandle[],
  opts: { maxFires?: number } = {},
): SimResult | null {
  const maxFires = opts.maxFires ?? 50;
  const fires: SimFire[] = [];
  const spec = specFromRule(rule);

  if (rule.type !== 'indicatorCross') {
    // `priceCross` tests the candle band that straddles the level; candle
    // close tests the close. Both use the same spec the live evaluator uses.
    for (const c of candles) {
      const value = rule.type === 'priceCross' ? (rule.direction === 'above' ? c.h : c.l) : c.c;
      if (!spec.isSatisfiedBy({ value, source: 'simulation' })) continue;
      fires.push({ at: c.t, price: rule.type === 'priceCross' ? rule.level : c.c });
      if (fires.length >= maxFires) break;
    }
  } else {
    const parsed = parseIndicatorSpec(rule.indicator);
    if (!parsed) return null;
    const indicatorCandles: Candle[] = candles.map((c) => ({
      symbol: rule.symbol,
      tf: rule.tf,
      t: c.t,
      o: c.o,
      h: c.h,
      l: c.l,
      c: c.c,
      v: null,
      source: 'simulation',
      fetchedAt: Date.now(),
    }));
    const series = computeIndicator({
      symbol: rule.symbol,
      tf: rule.tf,
      kind: parsed.kind,
      params: parsed.params,
      candles: indicatorCandles,
    }).values;

    let previous: number | null = null;
    for (let i = 0; i < series.length; i += 1) {
      const current = indicatorScalar(series[i])?.value ?? null;
      if (
        current !== null &&
        spec.isSatisfiedBy({ value: current, source: 'simulation' }, { previousValue: previous })
      ) {
        fires.push({ at: candles[i]!.t, price: current });
        if (fires.length >= maxFires) break;
      }
      if (current !== null) previous = current;
    }
  }

  let avgHoldMs = 0;
  if (fires.length >= 2) {
    let total = 0;
    for (let i = 1; i < fires.length; i += 1) {
      total += fires[i]!.at - fires[i - 1]!.at;
    }
    avgHoldMs = total / (fires.length - 1);
  }

  return { fires, avgHoldMs };
}
