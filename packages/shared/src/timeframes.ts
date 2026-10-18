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

import { z } from 'zod';

export const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

const TIMEFRAME_ALIAS_MAP: Readonly<Record<string, Timeframe>> = {
  M1: '1m',
  '1MIN': '1m',
  '1MINUTE': '1m',
  M5: '5m',
  '5MIN': '5m',
  '5MINUTE': '5m',
  M15: '15m',
  '15MIN': '15m',
  '15MINUTE': '15m',
  M30: '30m',
  '30MIN': '30m',
  '30MINUTE': '30m',
  H1: '1h',
  '1HR': '1h',
  '1HOUR': '1h',
  HOURLY: '1h',
  H4: '4h',
  '4HR': '4h',
  '4HOUR': '4h',
  D: '1d',
  D1: '1d',
  DAILY: '1d',
  '1DAY': '1d',
  W: '1w',
  W1: '1w',
  WEEKLY: '1w',
  '1WK': '1w',
  '1WEEK': '1w',
};

export function normalizeTimeframe(tf: string): string {
  const lower = tf.trim().toLowerCase();
  if ((TIMEFRAMES as readonly string[]).includes(lower)) return lower;
  const upper = tf.trim().toUpperCase();
  return TIMEFRAME_ALIAS_MAP[upper] ?? lower;
}

export const TimeframeSchema = z
  .string()
  .transform((val) => normalizeTimeframe(val))
  .refine((val): val is Timeframe => (TIMEFRAMES as readonly string[]).includes(val), {
    message: `Unsupported timeframe. Expected one of: ${TIMEFRAMES.join(', ')}`,
  });

export function isTimeframe(value: unknown): value is Timeframe {
  if (typeof value !== 'string') return false;
  const normalized = normalizeTimeframe(value);
  return (TIMEFRAMES as readonly string[]).includes(normalized);
}

/** Approx milliseconds per bar — for cache TTLs and time math. */
export function msPerTimeframe(tf: Timeframe): number {
  switch (tf) {
    case '1m':
      return 60_000;
    case '5m':
      return 5 * 60_000;
    case '15m':
      return 15 * 60_000;
    case '30m':
      return 30 * 60_000;
    case '1h':
      return 60 * 60_000;
    case '4h':
      return 4 * 60 * 60_000;
    case '1d':
      return 24 * 60 * 60_000;
    case '1w':
      return 7 * 24 * 60 * 60_000;
  }
}

export const DEFAULT_TIMEFRAME: Timeframe = '1h';
