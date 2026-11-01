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

// Market-data staleness gate for backtests (audit 2026-10-31 R8).
//
// A stale-while-revalidate candle window may be missing recent bars, so a
// backtest refuses it unless the caller explicitly accepts it via
// `allowStaleData`. The gate lives here rather than in `run-service.ts` so the
// run service stays inside the F01 file-size budget and the operator-facing
// messages have a single owner.

import { candlesAgeSeconds, getCandles } from '@kestrel/data';
import type { Candle, Symbol, Timeframe } from '@kestrel/shared';

export interface BacktestCandleWindowArgs {
  symbol: Symbol;
  timeframe: Timeframe;
  /** Number of bars requested (the caller has already clamped this). */
  count: number;
  from?: string;
  to?: string;
  signal?: AbortSignal;
  /**
   * Accept a candle window served from a stale-while-revalidate cache after
   * an upstream failure. Default false: the run is refused. Legitimate for
   * archived historical windows whose closed bars cannot change.
   */
  allowStaleData?: boolean;
}

export interface BacktestCandleWindow {
  candles: Candle[];
  /** Seconds of stale-while-revalidate age; null when the window was fresh. */
  staleWindowSeconds: number | null;
}

/**
 * Load the candle window for a backtest and enforce the freshness gate.
 *
 * Throws the provider-wrapped load error when the fetch fails, and the
 * refusal error when the window was served stale without `allowStaleData`.
 */
export async function loadBacktestCandleWindow(
  args: BacktestCandleWindowArgs,
): Promise<BacktestCandleWindow> {
  let candles: Candle[];
  let staleWindowSeconds: number | null = null;
  try {
    const result = await getCandles(args.symbol, args.timeframe, {
      count: args.count,
      includeOpenBar: false,
      ...(args.from ? { from: args.from } : {}),
      ...(args.to ? { to: args.to } : {}),
      ...(args.signal ? { signal: args.signal } : {}),
    });
    candles = result.candles;
    if (result.stale) staleWindowSeconds = candlesAgeSeconds(result);
  } catch (err) {
    throw new Error(
      `Could not load ${args.symbol} ${args.timeframe} candles: ${
        err instanceof Error ? err.message : String(err)
      }`,
      { cause: err },
    );
  }

  if (staleWindowSeconds !== null && args.allowStaleData !== true) {
    throw new Error(
      `The ${args.symbol} ${args.timeframe} candle window was served from a stale cache after an ` +
        `upstream failure (age ${staleWindowSeconds}s), so recent bars may be missing and the run was ` +
        `refused. Re-run when the provider is reachable, or pass allowStaleData: true to accept a stale ` +
        `window (legitimate for archived historical windows whose closed bars cannot change).`,
    );
  }

  return { candles, staleWindowSeconds };
}

/** Warning line for a run that accepted a stale window via `allowStaleData`. */
export function staleWindowWarning(staleWindowSeconds: number): string {
  return `Market data window was served stale (age ${staleWindowSeconds}s) with allowStaleData enabled — verify the window before trusting these results.`;
}
