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

// Tool: verify_call.
//
// Verifies a directional setup by:
//   1. Grounding the proposed levels against the live market price.
//   2. Sanity-checking entry / stop / target geometry.
//   3. Scanning recent structure for the nearest opposing liquidity
//      (swing high above entry for a long, swing low below entry for a
//      short).
//   4. Flagging when that opposing level sits inside entry→target.
//
// Pure deterministic logic — no LLM call. The output is consumed by the
// `verify-warning` chat part which renders caveats next to the agent's
// directional call rather than silencing it.

import { getCandles, getPrice } from '@kestrel/data';
import { computeStructure } from '@kestrel/indicators';
import {
  VerifyCallInputSchema,
  type Symbol,
  type VerifyCallCaveat,
  type VerifyCallOutput,
} from '@kestrel/shared';
import { tool } from 'ai';
import type { z } from 'zod';

const InputSchema = VerifyCallInputSchema;

declare module '@kestrel/shared' {
  interface ToolIOMap {
    verify_call: { input: z.infer<typeof InputSchema> };
  }
}

export const verifyCallTool = tool({
  description:
    'Verify a directional setup. Re-checks the proposed levels against the live market, validates entry/stop/target geometry, and scans recent structure for the nearest opposing liquidity (swing high above for longs, swing low below for shorts). Use after naming a setup and before presenting it as verified.',
  inputSchema: InputSchema,
  execute: async ({
    symbol,
    side,
    entry,
    stop,
    target,
    tf,
    lookbackBars,
  }): Promise<VerifyCallOutput> => {
    const caveats: VerifyCallCaveat[] = [];
    const nullableTarget = target ?? null;

    let marketPrice: number | null = null;
    let marketTolerance: number | null = null;

    try {
      const tick = await getPrice(symbol);
      marketPrice = tick.mid;
      marketTolerance = marketDistanceTolerance(symbol, tick.mid, tf);

      const levels = [
        { name: 'entry', value: entry },
        { name: 'stop', value: stop },
        ...(nullableTarget !== null ? [{ name: 'target', value: nullableTarget }] : []),
      ];

      for (const level of levels) {
        const distance = Math.abs(level.value - tick.mid);
        if (distance > marketTolerance) {
          caveats.push({
            code: 'level_far_from_market',
            message:
              `${capitalize(level.name)} ${level.value.toFixed(decimals(symbol))} sits ` +
              `${distance.toFixed(decimals(symbol))} away from live ${symbol} price ` +
              `${tick.mid.toFixed(decimals(symbol))} (tolerance ${marketTolerance.toFixed(decimals(symbol))}).`,
          });
        }
      }
    } catch {
      caveats.push({
        code: 'market_price_unavailable',
        message:
          'Could not fetch the live market price, so this setup was not grounded against the current market.',
      });
    }

    // Geometry checks next — cheap and deterministic.
    if (side === 'long' && stop >= entry) {
      caveats.push({
        code: 'invalid_stop_side',
        message: `Long with stop ${stop} ≥ entry ${entry} — stop must sit below entry.`,
      });
    }
    if (side === 'short' && stop <= entry) {
      caveats.push({
        code: 'invalid_stop_side',
        message: `Short with stop ${stop} ≤ entry ${entry} — stop must sit above entry.`,
      });
    }
    if (nullableTarget !== null) {
      if (side === 'long' && nullableTarget <= entry) {
        caveats.push({
          code: 'invalid_target_side',
          message: `Long with target ${nullableTarget} ≤ entry ${entry} — target must sit above entry.`,
        });
      }
      if (side === 'short' && nullableTarget >= entry) {
        caveats.push({
          code: 'invalid_target_side',
          message: `Short with target ${nullableTarget} ≥ entry ${entry} — target must sit below entry.`,
        });
      }
    } else {
      caveats.push({
        code: 'no_invalidation',
        message: 'No target supplied — invalidation level missing.',
      });
    }

    // Structure scan for nearest opposing liquidity.
    let nearestOpposingLiquidity: VerifyCallOutput['nearestOpposingLiquidity'] = null;
    try {
      const candles = await getCandles(symbol, tf, { count: lookbackBars });
      const structure = computeStructure({
        symbol,
        tf,
        candles,
        kinds: ['swings'],
        swings: { lookback: 1 },
      });
      const swings = structure.swings ?? [];
      const lastIndex = candles.length - 1;

      if (swings.length === 0) {
        caveats.push({
          code: 'thin_structure',
          message: 'Structure scan returned no swings — thin candle window.',
        });
      } else if (side === 'long') {
        const above = [...swings].reverse().find((s) => s.type === 'high' && s.price > entry);
        if (above) {
          nearestOpposingLiquidity = {
            price: above.price,
            kind: 'swing_high',
            barsAgo: lastIndex - above.index,
          };
          if (nullableTarget !== null && above.price < nullableTarget) {
            caveats.push({
              code: 'opposing_liquidity_in_path',
              message: `Long target ${nullableTarget} sits beyond a swing high at ${above.price.toFixed(decimals(symbol))} — that level may sweep before TP.`,
            });
          }
        }
      } else {
        const below = [...swings].reverse().find((s) => s.type === 'low' && s.price < entry);
        if (below) {
          nearestOpposingLiquidity = {
            price: below.price,
            kind: 'swing_low',
            barsAgo: lastIndex - below.index,
          };
          if (nullableTarget !== null && below.price > nullableTarget) {
            caveats.push({
              code: 'opposing_liquidity_in_path',
              message: `Short target ${nullableTarget} sits beyond a swing low at ${below.price.toFixed(decimals(symbol))} — that level may sweep before TP.`,
            });
          }
        }
      }
    } catch {
      caveats.push({
        code: 'thin_structure',
        message: 'Could not load candles for the structure scan.',
      });
    }

    const agree = caveats.length === 0;
    const rationale = buildRationale({
      symbol,
      side,
      entry,
      stop,
      target: nullableTarget,
      marketPrice,
      marketTolerance,
      nearestOpposingLiquidity,
      agree,
      caveats,
    });

    return {
      symbol,
      asOf: Date.now(),
      side,
      entry,
      stop,
      target: nullableTarget,
      marketPrice,
      marketTolerance,
      agree,
      caveats,
      nearestOpposingLiquidity,
      rationale,
    };
  },
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function decimals(symbol: Symbol): number {
  return symbol === 'XAUUSD' ? 2 : 5;
}

/**
 * Per-instrument daily volatility scaling factors (fraction of price).
 * Conservative but realistic estimates, not real-time ATR.  The tolerance
 * widens for volatile instruments and longer timeframes, and tightens for
 * short-timeframe scalps where levels must sit near the live price.
 */
const INSTRUMENT_VOLATILITY: Record<string, number> = {
  XAUUSD: 0.015, // ~$60/day on $4000
  XAGUSD: 0.025,
  BTCUSD: 0.04, // crypto moves more
  ETHUSD: 0.04,
  EURUSD: 0.02, // forex majors keep the original 2% baseline
  GBPUSD: 0.02,
  USDJPY: 0.02,
  USDCHF: 0.02,
  AUDUSD: 0.02,
  NZDUSD: 0.02,
  USDCAD: 0.02,
};

const DEFAULT_VOLATILITY_FACTOR = 0.02;

/**
 * Timeframe scalars: shorter timeframes demand tighter tolerances because
 * the model's entry should be near the current market price; longer
 * timeframes allow levels further away (swing trades).
 */
const TIMEFRAME_SCALARS: Record<string, number> = {
  '1m': 0.3,
  '5m': 0.4,
  '15m': 0.5,
  '30m': 0.7,
  '1h': 1.0,
  '4h': 1.3,
  '1d': 1.8,
  '1w': 2.5,
};

const DEFAULT_TIMEFRAME_SCALAR = 1.0;

function marketDistanceTolerance(symbol: Symbol, livePrice: number, tf = '1h'): number {
  const volFactor = INSTRUMENT_VOLATILITY[symbol] ?? DEFAULT_VOLATILITY_FACTOR;
  const tfScalar = TIMEFRAME_SCALARS[tf] ?? DEFAULT_TIMEFRAME_SCALAR;
  const percentageFactor = volFactor * tfScalar;
  // Floor: keep a minimum pip-equivalent window so rounding noise never
  // produces a zero-width tolerance.
  const pipFloor = symbol === 'XAUUSD' ? 5.0 : 0.001;
  return Math.max(pipFloor, livePrice * percentageFactor);
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function buildRationale(args: {
  symbol: Symbol;
  side: 'long' | 'short';
  entry: number;
  stop: number;
  target: number | null;
  marketPrice: number | null;
  marketTolerance: number | null;
  nearestOpposingLiquidity: VerifyCallOutput['nearestOpposingLiquidity'];
  agree: boolean;
  caveats: VerifyCallCaveat[];
}): string {
  const d = decimals(args.symbol);
  const head = `${args.side === 'long' ? 'Long' : 'Short'} ${args.symbol}: entry ${args.entry.toFixed(d)} · stop ${args.stop.toFixed(d)}${args.target !== null ? ` · target ${args.target.toFixed(d)}` : ''}.`;
  const marketLine =
    args.marketPrice !== null && args.marketTolerance !== null
      ? ` Checked against live price ${args.marketPrice.toFixed(d)} (tolerance ${args.marketTolerance.toFixed(d)}).`
      : ' Live price check unavailable.';
  if (args.agree) {
    const liquidityLine = args.nearestOpposingLiquidity
      ? ` Nearest opposing ${args.nearestOpposingLiquidity.kind === 'swing_high' ? 'swing high' : 'swing low'} at ${args.nearestOpposingLiquidity.price.toFixed(d)} (${args.nearestOpposingLiquidity.barsAgo} bars back).`
      : '';
    return `${head}${marketLine} Geometry checks out.${liquidityLine}`;
  }
  return `${head}${marketLine} ${args.caveats.length} caveat${args.caveats.length === 1 ? '' : 's'}: ${args.caveats.map((c) => c.message).join(' · ')}`;
}
