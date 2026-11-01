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

// R13 (audit 2026-10-31): single source of truth for "is this model-supplied
// price level plausible for this symbol right now".
//
// Two consumers share it:
//
//   - `verify_call` uses `marketDistanceTolerance` to *warn* when a proposed
//     level sits far from the live market (a soft caveat; the call is still
//     shown).
//   - the mutation extractor and the `log_journal` tool use
//     `checkLevelsAgainstMarket` to *refuse* a level the model proposed when
//     it falls outside a documented band around the live mid. Out-of-band is
//     a hard validation failure with a user-visible reason; the value is
//     never clamped, because clamping would fabricate a level the model never
//     proposed.
//
// Market data comes from the same `@kestrel/data` getter every other AI path
// uses (`getPrice`, the freshness-preserving read). A missing, stale, or
// too-old quote counts as unavailable: level-bearing writes then fail closed
// and the draft is preserved for a retry.

import { getPrice, priceAgeSeconds } from '@kestrel/data';
import { pipSize, priceDecimals, type Symbol } from '@kestrel/shared';
import { createCategorizedLogger } from '@kestrel/shared/logger';

const llog = createCategorizedLogger('ai', { component: 'level-sanity' });

/**
 * Band applied to model-supplied *trade* levels (journal entry / stop /
 * target / exit, and the `log_journal` tool): the level must sit within this
 * many times the instrument's estimated daily move of the current mid.
 *
 * Rationale: one unit of the base tolerance (below) is roughly one average
 * daily move for the symbol, so ten of them (about two trading weeks of
 * adverse travel) comfortably admits a legitimate wide swing stop - e.g. a
 * 10% stop on gold at 4,000 or a 20% stop on EURUSD - while rejecting a
 * hallucinated or wrong-symbol magnitude: entry 999999 on XAUUSD sits about
 * 1,700x the band outside it. Values from long ago still belong in the
 * journal UI (which this check does not touch); chat extraction timestamps
 * every entry at "now", so the band is a current-trade plausibility check,
 * not a historical-range check.
 */
export const TRADE_LEVEL_BAND_MULTIPLIER = 10;

/**
 * Band applied to model-supplied *alert* levels. Alerts are forward-looking
 * by design: "tell me when gold reaches 3,300" is legitimate while gold
 * trades at 4,000, so this band is deliberately much wider than the trade
 * band. It exists only to catch values no market could plausibly print for
 * the symbol (a hallucinated magnitude, or a price pasted from another
 * instrument), never to second-guess a distant target price.
 */
export const ALERT_LEVEL_BAND_MULTIPLIER = 50;

/**
 * Hard ceiling on the band as a fraction of the mid so the lower edge stays
 * positive for volatile instruments (50 daily moves on BTC would otherwise
 * reach below zero).
 */
export const MAX_LEVEL_BAND_RATIO = 0.95;

/**
 * A quote older than this is not used to sanity-check a level. Matches the
 * alert evaluator's price gate (`ALERT_MAX_PRICE_AGE_SECONDS`) so "live"
 * means the same thing across the product.
 */
export const LEVEL_CHECK_MAX_QUOTE_AGE_SECONDS = 300;

/**
 * Per-instrument daily volatility scaling factors (fraction of price).
 * Conservative but realistic estimates, not real-time ATR. The tolerance
 * widens for volatile instruments and longer timeframes, and tightens for
 * short-timeframe scalps where levels must sit near the live price.
 */
const INSTRUMENT_VOLATILITY: Record<string, number> = {
  XAUUSD: 0.015, // ~$60/day on $4000
  XAGUSD: 0.025,
  BTCUSD: 0.04, // crypto moves more
  ETHUSD: 0.04,
  BTCUSDT: 0.04,
  ETHUSDT: 0.04,
  SOLUSDT: 0.05,
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
 * the model's entry should be near the current market price; longer time
 * frames allow levels further away (swing trades).
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

export function marketDistanceTolerance(symbol: Symbol, livePrice: number, tf = '1h'): number {
  const volFactor = INSTRUMENT_VOLATILITY[symbol] ?? DEFAULT_VOLATILITY_FACTOR;
  const tfScalar = TIMEFRAME_SCALARS[tf] ?? DEFAULT_TIMEFRAME_SCALAR;
  const percentageFactor = volFactor * tfScalar;
  // Floor: keep a minimum pip-equivalent window so rounding noise never
  // produces a zero-width tolerance.
  const pipFloor = symbol === 'XAUUSD' ? 5.0 : pipSize(symbol) * 10;
  return Math.max(pipFloor, livePrice * percentageFactor);
}

export type LevelBandKind = 'trade' | 'alert';

export interface ModelLevel {
  /** Field name shown in a rejection message, e.g. `entry` or `stop`. */
  name: string;
  value: number;
}

export type LevelCheckFailureReason =
  'invalid_level' | 'level_out_of_band' | 'market_data_unavailable';

export type LevelCheckResult =
  | { ok: true; symbol: Symbol; mid: number; band: number; quoteAgeSeconds: number }
  | { ok: false; reason: LevelCheckFailureReason; message: string };

/**
 * The symmetric plausibility band around `mid` for a level kind. Floors at
 * the same pip-equivalent window `marketDistanceTolerance` uses, and caps at
 * `MAX_LEVEL_BAND_RATIO` of the mid so the lower edge stays positive.
 */
export function levelBandFor(
  symbol: Symbol,
  mid: number,
  kind: LevelBandKind = 'trade',
): { lower: number; upper: number; band: number } {
  const multiplier = kind === 'alert' ? ALERT_LEVEL_BAND_MULTIPLIER : TRADE_LEVEL_BAND_MULTIPLIER;
  const tolerance = marketDistanceTolerance(symbol, mid);
  const band = Math.min(tolerance * multiplier, mid * MAX_LEVEL_BAND_RATIO);
  return { lower: mid - band, upper: mid + band, band };
}

function formatLevel(symbol: Symbol, value: number): string {
  return value.toFixed(priceDecimals(symbol));
}

function joinLevelNames(levels: readonly ModelLevel[]): string {
  const names = levels.map((level) => level.name);
  if (names.length <= 1) return names[0] ?? 'the level';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function marketUnavailableMessage(
  symbol: Symbol,
  levels: readonly ModelLevel[],
  cause: 'unavailable' | 'stale',
): string {
  const names = joinLevelNames(levels);
  const reason =
    cause === 'stale'
      ? `Live ${symbol} market data is too old to trust`
      : `Live ${symbol} market data is unavailable`;
  return `${reason}, so ${names} could not be checked against the market. Nothing was saved and the draft was kept. Try again in a moment.`;
}

/**
 * Bound every model-supplied level for `symbol`: finite, positive, and within
 * the documented band around the live mid.
 *
 * Fails closed when the market cannot be read (provider error, non-finite
 * mid, stale cache, or a quote older than `LEVEL_CHECK_MAX_QUOTE_AGE_SECONDS`)
 * so no unverified level reaches a write; callers keep their draft and
 * surface the message as the reason.
 */
export async function checkLevelsAgainstMarket(args: {
  symbol: Symbol;
  levels: readonly ModelLevel[];
  band?: LevelBandKind;
  signal?: AbortSignal;
}): Promise<LevelCheckResult> {
  const { symbol, levels } = args;
  const band = args.band ?? 'trade';

  const invalid = levels.find((level) => !Number.isFinite(level.value) || level.value <= 0);
  if (invalid) {
    return {
      ok: false,
      reason: 'invalid_level',
      message: `${symbol} ${invalid.name} ${String(invalid.value)} is not a finite, positive price. Nothing was saved. Correct the value and try again.`,
    };
  }

  let quote;
  try {
    quote = await getPrice(symbol, args.signal ? { signal: args.signal } : {});
  } catch (error) {
    llog.warn('level check skipped: live price unavailable', {
      symbol,
      levels: levels.map((level) => level.name),
      err: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false,
      reason: 'market_data_unavailable',
      message: marketUnavailableMessage(symbol, levels, 'unavailable'),
    };
  }

  const mid = quote.tick.mid;
  const quoteAgeSeconds = priceAgeSeconds(quote);
  const tooOld =
    quote.stale || quote.tick.stale === true || quoteAgeSeconds > LEVEL_CHECK_MAX_QUOTE_AGE_SECONDS;
  if (!Number.isFinite(mid) || mid <= 0 || tooOld) {
    llog.warn('level check skipped: quote not usable', {
      symbol,
      mid,
      stale: quote.stale,
      quoteAgeSeconds,
    });
    return {
      ok: false,
      reason: 'market_data_unavailable',
      message: marketUnavailableMessage(symbol, levels, 'stale'),
    };
  }

  const { lower, upper, band: width } = levelBandFor(symbol, mid, band);
  const outside = levels.filter((level) => level.value < lower || level.value > upper);
  if (outside.length > 0) {
    const details = outside
      .map(
        (level) =>
          `${level.name} ${formatLevel(symbol, level.value)} is outside ${formatLevel(symbol, lower)} to ${formatLevel(symbol, upper)}`,
      )
      .join('; ');
    return {
      ok: false,
      reason: 'level_out_of_band',
      message: `${symbol} ${details} around the live mid ${formatLevel(symbol, mid)}. Nothing was saved. Correct the level and try again.`,
    };
  }

  return { ok: true, symbol, mid, band: width, quoteAgeSeconds };
}
