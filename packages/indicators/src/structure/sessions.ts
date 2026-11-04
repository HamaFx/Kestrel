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

// UTC session windows and pure OHLC slicing.
//
// Single source of truth for the Asia 00:00–07:00, London 07:00–12:00, and
// New York 12:00–21:00 UTC boundaries. The AI `get_session_levels` tool, the
// Asian-range structure helper, and any backtester session level read from
// here, so a boundary can only change in one place.

import type { Candle, SessionRange, SessionTag } from '@kestrel/shared';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface SessionWindow {
  session: SessionTag;
  /** Inclusive start hour, UTC. */
  startHour: number;
  /** Exclusive end hour, UTC. */
  endHour: number;
}

export const SESSION_WINDOWS: readonly SessionWindow[] = [
  { session: 'asia', startHour: 0, endHour: 7 },
  { session: 'london', startHour: 7, endHour: 12 },
  { session: 'ny', startHour: 12, endHour: 21 },
];

/** UTC midnight for the day containing `ms`. */
export function startOfUtcDayMs(ms: number): number {
  const date = new Date(ms);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * Slice one session's OHLC out of a 1H candle window.
 *
 * `close` is only set once the session has ended; a forming session reports
 * null so a consumer never treats a moving close as final.
 */
export function sliceSessionRange(
  candles: readonly Candle[],
  dayStartMs: number,
  nowMs: number,
  window: SessionWindow,
): SessionRange {
  const fromMs = dayStartMs + window.startHour * HOUR_MS;
  const toMs = dayStartMs + window.endHour * HOUR_MS;
  const inWindow = candles.filter((candle) => candle.t >= fromMs && candle.t < toMs);

  if (inWindow.length === 0) {
    return {
      session: window.session,
      fromMs,
      toMs,
      open: null,
      high: null,
      low: null,
      close: null,
      forming: nowMs < toMs,
    };
  }

  let high = Number.NEGATIVE_INFINITY;
  let low = Number.POSITIVE_INFINITY;
  for (const candle of inWindow) {
    if (candle.h > high) high = candle.h;
    if (candle.l < low) low = candle.l;
  }

  const sessionEnded = nowMs >= toMs;
  return {
    session: window.session,
    fromMs,
    toMs,
    open: inWindow[0]!.o,
    high: Number.isFinite(high) ? high : null,
    low: Number.isFinite(low) ? low : null,
    close: sessionEnded ? inWindow[inWindow.length - 1]!.c : null,
    forming: !sessionEnded,
  };
}

/**
 * Today's (and optionally the prior day's) session ranges for a 1H window.
 * Days with no bars yield null-valued ranges with their `forming` flag, which
 * lets the caller disclose "no data" instead of inventing levels.
 */
export function computeSessionRanges(
  candles: readonly Candle[],
  nowMs = Date.now(),
  options: { includePrior?: boolean } = {},
): { today: SessionRange[]; prior: SessionRange[] | null } {
  const startOfToday = startOfUtcDayMs(nowMs);
  return {
    today: SESSION_WINDOWS.map((window) => sliceSessionRange(candles, startOfToday, nowMs, window)),
    prior: options.includePrior
      ? SESSION_WINDOWS.map((window) =>
          sliceSessionRange(candles, startOfToday - DAY_MS, nowMs, window),
        )
      : null,
  };
}
