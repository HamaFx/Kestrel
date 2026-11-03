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

// Bespoke renderer for the `get_market_structure` tool part.
//
// Structure output is an objective list of swing pivots plus the band between
// the strongest recent swing high and the deepest recent swing low. The card
// surfaces the model's prose `summary` verbatim, then the range band, then the
// latest swing pivots with prices in `.tabular-nums`.
//
// Server component on purpose — no state, no events, no browser-only APIs.

import {
  isKnownSymbol,
  priceDecimals,
  type GetMarketStructureOutput,
  type SwingPoint,
} from '@kestrel/shared';

interface GetMarketStructurePartProps {
  /** Tool output, or `null` while streaming / before completion. */
  output: GetMarketStructureOutput | null;
  state: 'loading' | 'done' | 'error';
  errorMessage?: string;
}

export function GetMarketStructurePart({
  output,
  state,
  errorMessage,
}: GetMarketStructurePartProps) {
  if (state === 'error') {
    return <StructureError message={errorMessage} />;
  }
  if (state === 'loading' || !output) {
    return <StructureSkeleton />;
  }

  const decimals = isKnownSymbol(output.symbol) ? priceDecimals(output.symbol) : 5;
  const fmt = (value: number | null) => (value === null ? 'n/a' : value.toFixed(decimals));

  const swings: readonly SwingPoint[] = output.swings;
  // Last-N slices — we want the most recent context, so take from the tail.
  const lastSwings = swings.slice(-4).reverse();

  return (
    <div className="border-border bg-bg-elev-1 rounded-sm border p-3">
      <div className="text-fg-muted mb-2 text-xs">
        <span className="text-fg font-medium">{output.symbol}</span> · {output.tf} · structure (
        <span className="tabular-nums">{output.bars}</span> bars)
      </div>

      {output.summary ? (
        <p className="text-fg-muted mb-2 text-sm whitespace-pre-line">{output.summary}</p>
      ) : null}

      <div className="mb-2 grid grid-cols-3 gap-2">
        <RangeCell label="recent high" value={fmt(output.recentSwingHigh)} tone="text-bull" />
        <RangeCell label="recent low" value={fmt(output.recentSwingLow)} tone="text-bear" />
        <RangeCell label="range" value={fmt(output.rangeSize)} tone="text-fg" />
      </div>

      {lastSwings.length > 0 ? (
        <ul className="space-y-1">
          {lastSwings.map((s) => (
            <li
              key={`${s.type}-${s.index}`}
              className="flex min-h-[44px] items-center justify-between gap-2 text-sm"
            >
              <span className="text-fg-muted">
                swing-{s.type} @ bar <span className="tabular-nums">{s.index}</span>
              </span>
              <span
                className={s.type === 'high' ? 'text-bull tabular-nums' : 'text-bear tabular-nums'}
              >
                {s.price.toFixed(decimals)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-fg-subtle text-body-sm">No swing pivots qualified in this window.</p>
      )}
    </div>
  );
}

function RangeCell({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="border-border bg-bg-elev-2 rounded-sm border px-2 py-1.5">
      <span className="text-fg-subtle text-caption block">{label}</span>
      <span className={`block text-sm font-medium tabular-nums ${tone}`}>{value}</span>
    </div>
  );
}

function StructureSkeleton() {
  return (
    <div
      className="border-border bg-bg-elev-1 rounded-sm border p-3"
      aria-busy="true"
      aria-label="Loading market structure"
    >
      <div className="bg-bg-elev-2 mb-2 h-3 w-48 animate-pulse rounded-sm" />
      <div className="bg-bg-elev-2 mb-2 h-12 w-full animate-pulse rounded-sm" />
      <div className="bg-bg-elev-2 mb-2 h-3 w-40 animate-pulse rounded-sm" />
      <ul className="space-y-1">
        {[0, 1, 2].map((i) => (
          <li key={i} className="flex min-h-[44px] items-center justify-between gap-2">
            <span className="bg-bg-elev-2 h-4 w-24 animate-pulse rounded-sm" />
            <span className="bg-bg-elev-2 h-4 w-20 animate-pulse rounded-sm" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function StructureError({ message }: { message?: string }) {
  return (
    <div
      role="alert"
      className="border-danger/30 bg-bg-elev-1 text-danger rounded-sm border p-3 text-sm"
    >
      Market structure unavailable{message ? ` · ${message}` : ''}
    </div>
  );
}
