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

// Tool: annotate_chart.
//
// Computes objective swing pivots and session levels for a (symbol, tf,
// count) window and returns markers + price lines that the AI can reason
// about. The chat part renders a summary card with a deep link to the Pro
// chart at the relevant symbol/timeframe.
//
// The palette is hard-coded (matches the chart's CSS-token defaults) so
// the tool runs in any environment without reading the DOM.

import { getCandlesUnchecked } from '@kestrel/data';
import { computeAsianRange, computePdhPdl, computeStructure } from '@kestrel/indicators';
import {
  AnnotateChartInputSchema,
  type AnnotateChartKind,
  type AnnotateChartOutput,
  type Candle,
  type ChartMarker,
  type ChartPriceLine,
} from '@kestrel/shared';
import { tool, type Tool } from 'ai';
import type { z } from 'zod';

const InputSchema = AnnotateChartInputSchema;

declare module '@kestrel/shared' {
  interface ToolIOMap {
    annotate_chart: { input: z.infer<typeof InputSchema> };
  }
}

/**
 * Hex equivalents of the design tokens. Kept in sync with
 * `apps/web/src/app/globals.css` — recompute via the OKLCH fallback
 * only if those tokens change.
 */
const PALETTE = {
  warn: '#f5b945',
  muted: '#8a93a3',
  info: '#5fb1f5',
} as const;

export const annotateChartTool: Tool<z.infer<typeof InputSchema>, AnnotateChartOutput> = tool({
  description:
    "Compute chart annotations (swing pivots, previous-day high/low, Asian session range) for a symbol/timeframe. Use when the user asks to 'mark', 'show', or 'annotate' swing highs/lows, PDH/PDL, or the Asian range on the chart. The chat part renders a summary card with counts per kind and a deep link to open the Pro chart at this symbol/timeframe.",
  inputSchema: InputSchema,
  execute: async ({ symbol, tf, kinds, lookback, count }): Promise<AnnotateChartOutput> => {
    const candles = await getCandlesUnchecked(symbol, tf, { count });

    const markers: ChartMarker[] = [];
    const priceLines: ChartPriceLine[] = [];
    const counts: Partial<Record<AnnotateChartKind, number>> = {};
    const want = new Set<AnnotateChartKind>(kinds);

    if (want.has('swings')) {
      const r = computeStructure({ symbol, tf, candles, swings: { lookback } });
      for (const s of r.swings) {
        const t = bartime(candles, s.index);
        if (t === null) continue;
        markers.push({
          time: t,
          position: s.type === 'high' ? 'aboveBar' : 'belowBar',
          color: PALETTE.muted,
          shape: s.type === 'high' ? 'arrowDown' : 'arrowUp',
          text: '',
          size: '1',
        });
      }
      counts.swings = r.swings.length;
    }

    if (want.has('pdh_pdl')) {
      const pd = computePdhPdl(candles);
      if (pd) {
        priceLines.push({
          price: pd.high,
          color: PALETTE.info,
          lineWidth: '1',
          lineStyle: '2',
          axisLabelVisible: true,
          title: `PDH ${pd.high.toFixed(2)}`,
        });
        priceLines.push({
          price: pd.low,
          color: PALETTE.info,
          lineWidth: '1',
          lineStyle: '2',
          axisLabelVisible: true,
          title: `PDL ${pd.low.toFixed(2)}`,
        });
        counts.pdh_pdl = 2;
      }
    }

    if (want.has('asian_range')) {
      const ar = computeAsianRange(candles);
      if (ar) {
        priceLines.push({
          price: ar.high,
          color: PALETTE.warn,
          lineWidth: '1',
          lineStyle: '3',
          axisLabelVisible: true,
          title: `Asia H ${ar.high.toFixed(2)}${ar.forming ? ' (forming)' : ''}`,
        });
        priceLines.push({
          price: ar.low,
          color: PALETTE.warn,
          lineWidth: '1',
          lineStyle: '3',
          axisLabelVisible: true,
          title: `Asia L ${ar.low.toFixed(2)}${ar.forming ? ' (forming)' : ''}`,
        });
        counts.asian_range = 2;
      }
    }

    // Sort markers in chronological order.
    markers.sort((a, b) => a.time - b.time);

    // Materialize the counts object so missing kinds show as 0.
    const countsByKind: Record<AnnotateChartKind, number> = {
      swings: counts.swings ?? 0,
      pdh_pdl: counts.pdh_pdl ?? 0,
      asian_range: counts.asian_range ?? 0,
    };

    return {
      symbol,
      tf,
      asOf: Date.now(),
      markers: markers.slice(-30),
      priceLines: priceLines.slice(-15),
      countsByKind,
    };
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a candle index to a UTC seconds timestamp. */
function bartime(candles: Candle[], i: number): number | null {
  const c = candles[i];
  if (!c) return null;
  return Math.floor(c.t / 1000);
}
