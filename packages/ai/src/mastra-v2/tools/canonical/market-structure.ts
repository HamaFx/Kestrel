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
 * I-03 (audit 2026-10-18) — native Mastra registration of
 * `get_market_structure`.
 *
 * Lets the agent ask "what does structure look like on EURUSD 1h?" and get
 * back recent swing pivots plus the band between the strongest recent swing
 * high and the deepest recent swing low. Objective, reproducible price
 * extremes only: no heuristic zones or subjective break labels.
 */

import { getCandlesUnchecked } from '@kestrel/data';
import { computeStructure } from '@kestrel/indicators';
import {
  priceDecimals,
  type Candle,
  type GetMarketStructureOutput,
  type SwingPoint,
  type Symbol,
  type Timeframe,
} from '@kestrel/shared';
import { createTool } from '@mastra/core/tools';
import { type z } from 'zod';

import { maybeGetToolContext } from '@ai/runtime/tool-context';

import { createReadOnlyToolExecute } from '../tool-lifecycle';
import { CANONICAL_MARKET_STRUCTURE_DESCRIPTION } from './descriptions';
import { CanonicalMarketStructureInputSchema } from './input-schemas';

// Leaf re-exports: the values live in modules with no app-graph imports, so a
// module-scope read (legacy shims, other consumers) can never land on a binding
// that is still initialising inside the instance ↔ tools import cycle.
export type CanonicalMarketStructureInput = z.infer<typeof CanonicalMarketStructureInputSchema>;

const TAIL = 15;

interface MarketStructureComputationArgs {
  symbol: Symbol;
  tf: Timeframe;
  lookback: number;
  candles: Candle[];
}

interface RecentRange {
  recentSwingHigh: number | null;
  recentSwingLow: number | null;
  rangeSize: number | null;
}

/**
 * Pure projection shared by the native registration and the XAUUSD
 * market-structure tool.
 */
function computeMarketStructureOutput({
  symbol,
  tf,
  lookback,
  candles,
}: MarketStructureComputationArgs): GetMarketStructureOutput {
  const r = computeStructure({ symbol, tf, candles, swings: { lookback } });
  const range = recentRange(r.swings, lookback, symbol);

  return {
    symbol,
    tf,
    bars: r.bars,
    swings: r.swings.slice(-TAIL),
    ...range,
    summary: summarize(symbol, r.swings.length, range),
  };
}

/** Shared execute core. */
export async function executeCanonicalMarketStructure(
  input: CanonicalMarketStructureInput,
  signal?: AbortSignal,
): Promise<GetMarketStructureOutput> {
  const { symbol, tf, count, lookback } = input;
  const effectiveSignal = signal ?? maybeGetToolContext()?.signal ?? undefined;
  const candles = await getCandlesUnchecked(symbol, tf, {
    count,
    ...(effectiveSignal ? { signal: effectiveSignal } : {}),
  });
  return computeMarketStructureOutput({ symbol, tf, lookback, candles });
}

export const canonicalMarketStructureTool = createTool({
  id: 'kestrel-get_market_structure',
  description: CANONICAL_MARKET_STRUCTURE_DESCRIPTION,
  inputSchema: CanonicalMarketStructureInputSchema,
  execute: createReadOnlyToolExecute<CanonicalMarketStructureInput, GetMarketStructureOutput>(
    'kestrel-get_market_structure',
    'get_market_structure',
    (input, context) => executeCanonicalMarketStructure(input, context.abortSignal),
  ),
});

/**
 * Band between the strongest of the last `lookback` swing highs and the
 * deepest of the last `lookback` swing lows. Both sides must qualify before
 * a range size is reported.
 */
function recentRange(swings: readonly SwingPoint[], lookback: number, symbol: Symbol): RecentRange {
  const highs = swings
    .filter((s) => s.type === 'high')
    .slice(-lookback)
    .map((s) => s.price);
  const lows = swings
    .filter((s) => s.type === 'low')
    .slice(-lookback)
    .map((s) => s.price);

  const recentSwingHigh = highs.length > 0 ? Math.max(...highs) : null;
  const recentSwingLow = lows.length > 0 ? Math.min(...lows) : null;
  const rangeSize =
    recentSwingHigh !== null && recentSwingLow !== null && recentSwingHigh > recentSwingLow
      ? round(recentSwingHigh - recentSwingLow, symbol)
      : null;

  return { recentSwingHigh, recentSwingLow, rangeSize };
}

/** Compact human-readable summary the model can echo without big-array reasoning. */
function summarize(symbol: Symbol, swingCount: number, range: RecentRange): string {
  const fmt = (value: number | null) =>
    value === null ? 'n/a' : value.toFixed(priceDecimals(symbol));
  const label = swingCount === 1 ? 'swing' : 'swings';
  return `${swingCount} ${label} · recent high ${fmt(range.recentSwingHigh)} · recent low ${fmt(range.recentSwingLow)}`;
}

function round(value: number, symbol: Symbol): number {
  return Number(value.toFixed(priceDecimals(symbol)));
}
