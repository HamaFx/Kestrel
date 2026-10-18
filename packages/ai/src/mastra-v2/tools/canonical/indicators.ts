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
 * B-01 (audit 2026-10-18, I-03) — native Mastra registration of `get_indicators`.
 *
 * Computes one or more indicators against the same candle window in a single
 * call. Mirrors the /api/market/indicators route handler so the chart UI and
 * the AI agent always see identical numbers.
 */

import { getCandles } from '@kestrel/data';
import { computeIndicator } from '@kestrel/indicators';
import {
  IndicatorKindSchema,
  IndicatorParamsSchema,
  SymbolSchema,
  TimeframeSchema,
  type GetIndicatorsOutput,
  type IndicatorResult,
} from '@kestrel/shared';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { maybeGetToolContext } from '@ai/tool-context';
import { createReadOnlyToolExecute } from '../../agents/xauusd/legacy-tool-adapter';

export const CanonicalIndicatorsInputSchema = z.object({
  symbol: SymbolSchema,
  tf: TimeframeSchema,
  count: z.int().min(20).max(500).default(200),
  indicators: z
    .array(z.object({ kind: IndicatorKindSchema, params: IndicatorParamsSchema.default({}) }))
    .min(1)
    .max(6),
});

export type CanonicalIndicatorsInput = z.infer<typeof CanonicalIndicatorsInputSchema>;

export const CANONICAL_INDICATORS_DESCRIPTION =
  'Compute indicators (sma, ema, rsi, macd, atr, bollinger, pivots) on a (symbol, timeframe) window. Returns the last 15 points of each series — enough for "current value + recent slope" reasoning while minimizing token overhead.';

const TAIL_POINTS = 15;

/** Shared execute core: one candle window, many indicator series. */
export async function executeCanonicalIndicators(
  input: CanonicalIndicatorsInput,
  signal?: AbortSignal,
): Promise<GetIndicatorsOutput> {
  const { symbol, tf, count, indicators } = input;
  const effectiveSignal = signal ?? maybeGetToolContext()?.signal ?? undefined;
  const candles = await getCandles(symbol, tf, {
    count,
    ...(effectiveSignal ? { signal: effectiveSignal } : {}),
  });
  const results = indicators.map(({ kind, params }) => {
    const full = computeIndicator({ symbol, tf, kind, params, candles });
    return {
      ...full,
      values: full.values.slice(-TAIL_POINTS) as IndicatorResult['values'],
    };
  });
  return { symbol, tf, results };
}

export const canonicalIndicatorsTool = createTool({
  id: 'kestrel-get_indicators',
  description: CANONICAL_INDICATORS_DESCRIPTION,
  inputSchema: CanonicalIndicatorsInputSchema,
  execute: createReadOnlyToolExecute<CanonicalIndicatorsInput, GetIndicatorsOutput>(
    'kestrel-get_indicators',
    'get_indicators',
    (input, context) => executeCanonicalIndicators(input, context.abortSignal),
  ),
});
