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

// Bespoke renderer for the `get_indicators` tool part.
//
// `get_indicators` returns up to a handful of indicator results computed
// over the same symbol/timeframe window. The AI tool truncates each
// `values` series to the last 30 points, so we only have a short tail of
// the indicator to work with — this card focuses on the *latest* point
// for each kind, which is what the agent quotes back to the user.
//
// Per-kind layout (mobile-first, dense one-line rows):
//   sma / ema   →  kind(period)        : value
//   rsi         →  kind(period)        : value  with bull/bear/neutral colour
//   atr         →  kind(period)        : value
//   macd        →  kind(fast/slow/sig) : hist with bull/bear sign colour
//   bollinger   →  kind(period, k)     : U / M / L
//   pivots      →  kind                : P / R1 / S1
//
// All numerics use `.tabular-nums`. Sign colouring uses semantic tokens
// `text-bull` / `text-bear` and the neutral tone uses `text-fg-muted`.
//
// Server component on purpose — no state, no events, no browser-only APIs.
// Value rendering lives in `get-indicators-value.tsx`; narrowing helpers and
// label formatting in `get-indicators-format.ts`.

import { priceDecimals, type GetIndicatorsOutput } from '@kestrel/shared';

import { labelFor } from './get-indicators-format';
import { IndicatorsCardError, IndicatorsCardSkeleton } from './get-indicators-states';
import { IndicatorValue } from './get-indicators-value';

interface GetIndicatorsPartProps {
  /** Tool output, or `null` while streaming / before completion. */
  output: GetIndicatorsOutput | null;
  state: 'loading' | 'done' | 'error';
  errorMessage?: string;
}

export function GetIndicatorsPart({ output, state, errorMessage }: GetIndicatorsPartProps) {
  if (state === 'error') {
    return <IndicatorsCardError message={errorMessage} />;
  }
  if (state === 'loading' || !output) {
    return <IndicatorsCardSkeleton />;
  }

  const decimals = priceDecimals(output.symbol);

  return (
    <div className="surface-well rounded-xl p-3.5">
      <div className="border-border/40 mb-1 flex items-center justify-between gap-2 border-b pb-2">
        <span className="text-fg text-xs font-semibold">
          {output.symbol} · {output.tf}
        </span>
        <span className="text-fg-subtle font-mono text-[10px] uppercase">
          {output.results.length} {output.results.length === 1 ? 'indicator' : 'indicators'}
        </span>
      </div>
      <ul className="flex flex-col">
        {output.results.map((r, i) => (
          <li
            key={`${r.kind}-${i}`}
            className="border-border/30 flex items-start justify-between gap-3 border-b py-2 last:border-0"
          >
            <span className="text-fg pt-0.5 text-sm font-medium">{labelFor(r)}</span>
            <span className="flex flex-wrap items-baseline justify-end gap-x-2 gap-y-0.5 tabular-nums">
              <IndicatorValue result={r} decimals={decimals} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
