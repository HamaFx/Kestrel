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

// Bounded memo for indicator computations inside one collection pass.

import { computeIndicator } from '@kestrel/indicators';
import type { Candle, IndicatorRequest, Symbol, Timeframe } from '@kestrel/shared';

const indicatorMemo = new Map<string, ReturnType<typeof computeIndicator>>();
const INDICATOR_MEMO_MAX = 512;

export function computeIndicatorMemo(args: {
  symbol: Symbol;
  tf: Timeframe;
  kind: IndicatorRequest['kind'];
  params: IndicatorRequest['params'];
  candles: Candle[];
  /**
   * B-06 (audit 2026-10-18) — staleness bit. Two collects can share length and
   * last candle timestamp but differ in whether the candles were served from
   * the stale-while-error cache; without this bit the memo would reuse a stale
   * computation as if it were fresh after a provider failover.
   */
  stale?: boolean;
  /**
   * I-01 (audit 2026-10-18) — data-fetch production time. Two collects within
   * an open candle can share length and last candle timestamp while the
   * candle's close (and therefore every indicator value) has moved; without
   * `producedAt` the memo returns the earlier computation. `producedAt`
   * changes whenever a new candle payload was actually produced, so the key
   * is exact for the same-length/same-bar case without hashing candle bodies.
   */
  producedAt?: number;
}): ReturnType<typeof computeIndicator> {
  const lastT = args.candles.at(-1)?.t ?? 0;
  const staleBit = args.stale ? 's' : 'f';
  const producedAtBit = args.producedAt ?? 0;
  const key = `${args.symbol}:${args.tf}:${String(args.kind)}:${JSON.stringify(args.params)}:${args.candles.length}:${lastT}:${staleBit}:${producedAtBit}`;
  const memoized = indicatorMemo.get(key);
  if (memoized) {
    indicatorMemo.delete(key);
    indicatorMemo.set(key, memoized);
    return memoized;
  }
  const computed = computeIndicator(args);
  indicatorMemo.set(key, computed);
  if (indicatorMemo.size > INDICATOR_MEMO_MAX) {
    const oldest = indicatorMemo.keys().next().value;
    if (oldest !== undefined) indicatorMemo.delete(oldest);
  }
  return computed;
}
