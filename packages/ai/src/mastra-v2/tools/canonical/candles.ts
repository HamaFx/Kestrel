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

/**
 * B-01 (audit 2026-10-18, I-03) — native Mastra registration of `get_candles`.
 *
 * Returns OHLC bars for a (symbol, tf) window. Callers should prefer
 * `get_indicators` when they only need derived values — it's smaller in the
 * prompt and the model can't accidentally hallucinate over noisy bars.
 */

import { candlesAgeSeconds, getCandles } from '@kestrel/data';
import {
  msPerTimeframe,
  type Candle,
  type CandlePeriodSummary,
  type GetCandlesOutput,
} from '@kestrel/shared';
import { createTool } from '@mastra/core/tools';
import { type z } from 'zod';

import { maybeGetToolContext } from '@ai/runtime/tool-context';

import { createReadOnlyToolExecute } from '../tool-lifecycle';
import { CANONICAL_CANDLES_DESCRIPTION } from './descriptions';
import { CanonicalCandlesInputSchema } from './input-schemas';

// Leaf re-exports: the values live in modules with no app-graph imports, so a
// module-scope read (legacy shims, other consumers) can never land on a binding
// that is still initialising inside the instance ↔ tools import cycle.
export { CANONICAL_CANDLES_DESCRIPTION, CanonicalCandlesInputSchema };

export type CanonicalCandlesInput = z.infer<typeof CanonicalCandlesInputSchema>;

const TAIL_BARS = 30;

/** Shared execute core: candles plus the deterministic period summary. */
export async function executeCanonicalCandles(
  input: CanonicalCandlesInput,
  signal?: AbortSignal,
): Promise<GetCandlesOutput> {
  const { symbol, tf, count } = input;
  const effectiveSignal = signal ?? maybeGetToolContext()?.signal ?? undefined;
  // R8 (audit 2026-10-31): use the meta-returning getter so a stale-while-
  // revalidate window is disclosed instead of silently grounding cold bars.
  const result = await getCandles(symbol, tf, {
    count,
    ...(effectiveSignal ? { signal: effectiveSignal } : {}),
  });
  const candles = result.candles;

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
      // Never fabricate a 0% move: an open of 0 has no percentage (R8).
      changePct: first.o !== 0 ? Number((((last.c - first.o) / first.o) * 100).toFixed(3)) : null,
      avgBarRange: Number((totalRange / candles.length).toFixed(5)),
      totalVolume: Number(totalVolume.toFixed(2)),
    };
  }

  const now = Date.now();
  const barMs = msPerTimeframe(tf);
  let lastClosedBar: Candle | null = null;
  for (let i = candles.length - 1; i >= 0; i -= 1) {
    const bar = candles[i]!;
    if (bar.t + barMs <= now) {
      lastClosedBar = bar;
      break;
    }
  }

  const warnings: string[] = [];
  if (result.stale) {
    const age = candlesAgeSeconds(result, now);
    warnings.push(
      `${symbol} ${tf}: the candle window was served from a stale cache after an upstream failure (age ${age}s) — recent bars may be missing; do not present it as the current window.`,
    );
  }

  return {
    symbol,
    tf,
    candles: candles.slice(-TAIL_BARS),
    summary,
    freshness: {
      stale: result.stale,
      producedAt: result.producedAt,
      ageSeconds: candlesAgeSeconds(result, now),
      lastClosedBarAgeSeconds:
        lastClosedBar === null
          ? null
          : Math.max(0, Math.round((now - (lastClosedBar.t + barMs)) / 100) / 10),
    },
    warnings,
  };
}

export const canonicalCandlesTool = createTool({
  id: 'kestrel-get_candles',
  description: CANONICAL_CANDLES_DESCRIPTION,
  inputSchema: CanonicalCandlesInputSchema,
  execute: createReadOnlyToolExecute<CanonicalCandlesInput, GetCandlesOutput>(
    'kestrel-get_candles',
    'get_candles',
    (input, context) => executeCanonicalCandles(input, context.abortSignal),
  ),
});
