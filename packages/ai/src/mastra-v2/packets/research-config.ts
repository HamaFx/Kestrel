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

import type { IndicatorRequest, Timeframe } from '@kestrel/shared';

export interface ResearchWindow {
  timeframe: Timeframe;
  candleCount: number;
}

// Audit plan §2.1/P1-10 — the 1h/15m windows match the shared collector's
// `SYMBOL_RESEARCH_TIMEFRAMES` (was 200) so the XAUUSD verified-packet
// pipeline and the committee pipeline issue identical data-layer requests
// and share the candle cache instead of re-hitting providers per turn.
// 160 candles comfortably covers every indicator warmup below (max period
// 50); packet output is bounded separately via RESEARCH_CANDLE_OUTPUT.
export const XAUUSD_RESEARCH_WINDOWS: readonly ResearchWindow[] = [
  { timeframe: '1d', candleCount: 120 },
  { timeframe: '4h', candleCount: 120 },
  { timeframe: '1h', candleCount: 160 },
  { timeframe: '15m', candleCount: 160 },
];

export const XAUUSD_RESEARCH_INDICATORS: readonly IndicatorRequest[] = [
  { kind: 'ema', params: { period: 20 } },
  { kind: 'ema', params: { period: 50 } },
  { kind: 'rsi', params: { period: 14 } },
  { kind: 'macd', params: { fast: 12, slow: 26, signal: 9 } },
  { kind: 'atr', params: { period: 14 } },
  { kind: 'bollinger', params: { period: 20, multiplier: 2 } },
];

export const RESEARCH_CANDLE_OUTPUT = 80;
export const RESEARCH_INDICATOR_OUTPUT = 8;
export const RESEARCH_MACRO_GAP =
  'Macro, economic-calendar, news, dollar, and yield context are not included in this proof of concept.';
