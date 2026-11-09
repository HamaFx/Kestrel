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

import type { ChartPriceLine } from '@kestrel/shared';

/** Coerce a persisted price (JSON may hold either form) to a number. */
function toPrice(value: number | string): number {
  return typeof value === 'number' ? value : Number.parseFloat(value);
}

/** Format a numeric price cleanly for level labels. */
function formatPriceLabel(price: number, raw: number | string): string {
  if (typeof raw === 'string' && raw.trim().length > 0) return raw.trim();
  if (Math.abs(price) >= 100) return price.toFixed(2);
  if (Math.abs(price) >= 1) return price.toFixed(4);
  return price.toPrecision(4);
}

/**
 * Price-line visualization for the annotated chart snapshot.
 *
 * Uses a fixed `0 0 400 100` numeric viewBox for horizontal level lines and
 * overlays crisp HTML price value badges so labels never distort when the
 * container scales horizontally.
 */
export function PriceLineChart({ lines }: { lines: readonly ChartPriceLine[] }) {
  const validLines = lines
    .slice(0, 20)
    .map((line) => ({ line, price: toPrice(line.price) }))
    .filter((entry) => Number.isFinite(entry.price));

  if (validLines.length === 0) return null;

  const prices = validLines.map((entry) => entry.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  return (
    <div className="bg-bg-elev-1 border-border/80 relative mb-3 h-28 w-full overflow-hidden rounded-xl border">
      <svg
        className="size-full"
        viewBox="0 0 400 100"
        preserveAspectRatio="none"
        role="img"
        aria-label="Price levels visualization"
      >
        {validLines.map(({ line, price }, i) => {
          const y = validLines.length === 1 ? 50 : 14 + ((max - price) / range) * 72;
          return (
            <line
              key={`${line.title}-${price}-${i}`}
              x1="0"
              y1={y}
              x2="400"
              y2={y}
              stroke={line.color || '#e5e5e5'}
              strokeWidth="1.5"
              strokeDasharray={i % 2 === 0 ? 'none' : '4 2'}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>

      <div className="pointer-events-none absolute inset-0">
        {validLines.slice(0, 6).map(({ line, price }, i) => {
          const yPercent = validLines.length === 1 ? 50 : 14 + ((max - price) / range) * 72;
          const formattedPrice = formatPriceLabel(price, line.price);
          return (
            <div
              key={`label-${line.title}-${price}-${i}`}
              className="absolute right-2.5 flex -translate-y-1/2 items-center gap-1.5"
              style={{ top: `${yPercent}%` }}
            >
              <span
                className="bg-bg/90 text-fg rounded border px-1.5 py-0.5 font-mono text-[11px] leading-none font-medium tabular-nums shadow-xs"
                style={{ borderColor: line.color || 'rgba(255,255,255,0.2)' }}
              >
                {line.title ? `${line.title} · ` : ''}
                {formattedPrice}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
