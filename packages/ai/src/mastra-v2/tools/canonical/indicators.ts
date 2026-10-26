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
import { type GetIndicatorsOutput, type IndicatorResult } from '@kestrel/shared';
import { createTool } from '@mastra/core/tools';
import { type z } from 'zod';

import { maybeGetToolContext } from '@ai/runtime/tool-context';

import { createReadOnlyToolExecute } from '../../agents/xauusd/legacy-tool-adapter';
import { CANONICAL_INDICATORS_DESCRIPTION } from './descriptions';
import { CanonicalIndicatorsInputSchema } from './input-schemas';

// Leaf re-exports: the values live in modules with no app-graph imports, so a
// module-scope read (legacy shims, other consumers) can never land on a binding
// that is still initialising inside the instance ↔ tools import cycle.
export { CANONICAL_INDICATORS_DESCRIPTION, CanonicalIndicatorsInputSchema };

export type CanonicalIndicatorsInput = z.infer<typeof CanonicalIndicatorsInputSchema>;

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
