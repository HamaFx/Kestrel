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

// Tool: get_candles.
//
// Returns OHLC bars for a (symbol, tf) window. Callers should prefer
// `get_indicators` when they only need derived values — it's smaller in
// the prompt and the model can't accidentally hallucinate over noisy bars.

import { getCandles } from '@kestrel/data';
import {
  SymbolSchema,
  TimeframeSchema,
  type CandlePeriodSummary,
  type GetCandlesOutput,
} from '@kestrel/shared';
import { tool } from 'ai';
import { z } from 'zod';

import { maybeGetToolContext } from '../tool-context';

const InputSchema = z.object({
  symbol: SymbolSchema,
  tf: TimeframeSchema,
  /** Bars to fetch. Cap kept tight — the model rarely benefits from >200. */
  count: z.number().int().min(10).max(500).default(120),
});

declare module '@kestrel/shared' {
  interface ToolIOMap {
    get_candles: { input: z.infer<typeof InputSchema> };
  }
}

const TAIL_BARS = 30;

export const getCandlesTool = tool({
  description:
    'Fetch OHLC candles for one symbol at one timeframe (e.g. XAUUSD 1h). Returns a comprehensive period summary plus the most recent 30 candles to minimize token overhead. For RSI/MACD/EMA/etc. prefer get_indicators.',
  inputSchema: InputSchema,
  execute: async ({ symbol, tf, count }, options?: { abortSignal?: AbortSignal }): Promise<GetCandlesOutput> => {
    const signal = options?.abortSignal ?? maybeGetToolContext()?.signal ?? undefined;
    const candles = await getCandles(symbol, tf, { count, ...(signal ? { signal } : {}) });

    let summary: CandlePeriodSummary | null = null;
    if (candles.length > 0) {
      const first = candles[0]!;
      const last = candles[candles.length - 1]!;
      let highBar = first;
      let lowBar = first;
      let totalRange = 0;
      let totalVolume = 0;
      for (const c of candles) {
        if (c.h > highBar.h) highBar = c;
        if (c.l < lowBar.l) lowBar = c;
        totalRange += c.h - c.l;
        totalVolume += c.v ?? 0;
      }
      summary = {
        fromIso: new Date(first.t).toISOString(),
        toIso: new Date(last.t).toISOString(),
        open: first.o,
        high: highBar.h,
        highAtIso: new Date(highBar.t).toISOString(),
        low: lowBar.l,
        lowAtIso: new Date(lowBar.t).toISOString(),
        close: last.c,
        change: Number((last.c - first.o).toFixed(5)),
        changePct: first.o !== 0 ? Number((((last.c - first.o) / first.o) * 100).toFixed(3)) : 0,
        avgBarRange: Number((totalRange / candles.length).toFixed(5)),
        totalVolume: Number(totalVolume.toFixed(2)),
      };
    }

    return {
      symbol,
      tf,
      candles: candles.slice(-TAIL_BARS),
      summary,
    };
  },
});
