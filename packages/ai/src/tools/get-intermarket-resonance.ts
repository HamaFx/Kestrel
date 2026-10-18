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

/* eslint-disable @typescript-eslint/no-unused-vars */
import { schema } from '@kestrel/db';
import {
  GetIntermarketResonanceInputSchema,
  GetIntermarketResonanceOutputSchema,
  type GetIntermarketResonanceOutput,
  type ResonanceObservation,
  type Symbol,
} from '@kestrel/shared';
import { tool } from 'ai';
import { desc } from 'drizzle-orm';
import type { z } from 'zod';

import { getDb } from '../db';
import { maybeGetToolContext } from '../tool-context';

const InputSchema = GetIntermarketResonanceInputSchema;

declare module '@kestrel/shared' {
  interface ToolIOMap {
    get_intermarket_resonance: { input: z.infer<typeof InputSchema> };
  }
}

export const getIntermarketResonanceTool = tool({
  description:
    "Evaluate Gold (XAUUSD) or major currencies' intermarket divergence against US 10-Year Real Yields (Opportunity Cost) and inflation expectations. Calculates z-score 'Hedging Premium' divergence index. Use when the user asks 'Are yields matching gold price' or 'Analyze institutional safe-haven premium'.",
  inputSchema: InputSchema,
  execute: async ({ symbol, days }): Promise<GetIntermarketResonanceOutput> => {
    const requestedSymbol: Symbol = symbol ?? 'XAUUSD';
    const db = maybeGetToolContext()?.db ?? getDb();

    // 1. Query the intermarket_resonance table
    const rows = await db
      .select()
      .from(schema.intermarketResonance)
      .orderBy(desc(schema.intermarketResonance.date))
      .limit(days);

    // Keep oldest first for charting order
    const sorted = [...rows].reverse();

    if (sorted.length === 0) {
      // In a real sandbox or when sync hasn't run yet, serve a degraded but safe response
      return {
        symbol: requestedSymbol,
        days,
        observations: [],
        currentDivergence: null,
        currentRealYield: null,
        currentBreakevenInflation: null,
        regime: null,
        available: false,
        narrative:
          'No intermarket resonance historical entries found in the database. Sync pipeline pending.',
      };
    }

    const observations: ResonanceObservation[] = sorted.map((r) => ({
      date: r.date,
      realYieldPct: r.realYieldPct,
      breakevenInflationPct: r.breakevenInflationPct,
      goldClose: r.goldClose,
      divergenceScore: r.divergenceScore,
    }));

    const latest = sorted[sorted.length - 1]!;
    const currentDivergence = latest.divergenceScore ?? null;
    const currentRealYield = latest.realYieldPct ?? null;
    const currentBreakevenInflation = latest.breakevenInflationPct ?? null;

    // Define regimes based on standard deviations (z-scores)
    let regime: GetIntermarketResonanceOutput['regime'] = null;
    if (currentDivergence !== null) {
      if (currentDivergence > 1.5) {
        regime = 'divergent_hedging';
      } else if (currentDivergence < -1.5) {
        regime = 'divergent_discount';
      } else {
        regime = 'convergent';
      }
    }

    const narrative = compileNarrative(
      requestedSymbol,
      currentDivergence,
      currentRealYield,
      currentBreakevenInflation,
      regime,
    );

    return {
      symbol: requestedSymbol,
      days,
      observations,
      currentDivergence,
      currentRealYield,
      currentBreakevenInflation,
      regime,
      available: true,
      narrative,
    };
  },
});

function compileNarrative(
  symbol: Symbol,
  divergence: number | null,
  yieldPct: number | null,
  inflationPct: number | null,
  regime: GetIntermarketResonanceOutput['regime'],
): string {
  const roundedDiv =
    divergence !== null
      ? `${divergence >= 0 ? '+' : ''}${divergence.toFixed(2)}`
      : 'N/A';
  const roundedYield = yieldPct !== null ? `${yieldPct.toFixed(2)}%` : 'N/A';
  const roundedInf = inflationPct !== null ? `${inflationPct.toFixed(2)}%` : 'N/A';

  let desc: string;
  if (regime === 'divergent_hedging') {
    desc = `Gold is trading at a significant premium (${roundedDiv} SD) relative to its historical real-yield baseline. This highlights high institutional safe-haven demand, central bank accumulation, or geopolitical hedging premium overrides.`;
  } else if (regime === 'divergent_discount') {
    desc = `Gold is trading at a significant discount (${roundedDiv} SD) relative to yield opportunities. This indicates a highly oversold market, high opportunity cost exhaustion, or potential institutional accumulation territory.`;
  } else if (regime === 'convergent') {
    desc = `Gold and US real yields are trading in normal historical alignment (${roundedDiv} SD). The yield opportunity cost model is dominant and governing pricing.`;
  } else {
    desc = 'Intermarket yield and inflation baseline metrics are currently unavailable.';
  }

  const regimeLabel = regime ? ` [${regime.toUpperCase()}]` : '';
  return `${symbol} Resonance: Yield ${roundedYield} · Inflation Expectation ${roundedInf} · Divergence ${roundedDiv} SD${regimeLabel}. ${desc}`;
}
