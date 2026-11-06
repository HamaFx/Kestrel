'use client';

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

// Histogram of R-multiple buckets. Negative buckets are bearish, positive
// bullish, and the two tail buckets carry a diagonal hatch. The chart has a
// real count axis, a layered grid, a continuously interpolated average-R
// reference line and a hover card.
import type { JournalStatsWithNulls } from '@kestrel/shared';
import { m } from 'motion/react';
import { useId, useMemo, useState } from 'react';

import { ChartLegend, ChartTooltip } from '@/components/chart/chart-ui';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/formatters/cn';

const Y_TOP = 10;
const Y_BOTTOM = 92;
const TAIL_HATCH_CSS =
  'repeating-linear-gradient(45deg, transparent 0 3px, rgba(255,255,255,0.28) 3px 4px)';

const BUCKET_BOUNDS: ReadonlyArray<readonly [number, number]> = [
  [-Infinity, -2],
  [-2, -1],
  [-1, 0],
  [0, 0],
  [0, 1],
  [1, 2],
  [2, 3],
  [3, Infinity],
];

type BucketTone = 'bull' | 'bear' | 'neutral';

const LABEL_TONE: Record<BucketTone, string> = {
  bull: 'text-bull',
  bear: 'text-bear',
  neutral: 'text-fg-muted',
};

function bucketTone(bucket: string): BucketTone {
  if (bucket === '[0,0]') return 'neutral';
  return bucket.startsWith('[-') ? 'bear' : 'bull';
}

function bucketIndexForR(value: number): number {
  if (value === 0) return 3;
  for (let index = 0; index < BUCKET_BOUNDS.length; index++) {
    if (index === 3) continue;
    const [min, max] = BUCKET_BOUNDS[index] ?? [-Infinity, Infinity];
    if (value >= min && value <= max) return index;
  }
  return value < 0 ? 0 : BUCKET_BOUNDS.length - 1;
}

/**
 * Continuously map an R value to a 0–100 horizontal percentage across the 8
 * histogram buckets (`<-2`, `[-2,-1]`, `[-1,0]`, `[0,0]`, `[0,1]`, `[1,2]`,
 * `[2,3]`, `>3`) so +0.1R and +0.9R do not snap to the same bucket center.
 */
function continuousXForR(value: number, bucketCount: number): number {
  const slot = 100 / Math.max(bucketCount, 1);
  const centerOf = (index: number) => index * slot + slot / 2;
  if (bucketCount !== 8) {
    return centerOf(Math.min(bucketCount - 1, bucketIndexForR(value)));
  }
  if (value === 0) return centerOf(3);
  if (value > 0) {
    // Positive buckets are indices 4 ([0,1]), 5 ([1,2]), 6 ([2,3]), 7 (>3)
    const clamped = Math.min(value, 3.8);
    return Math.min(96, 4 * slot + (clamped / 4) * (4 * slot));
  }
  // Negative buckets are indices 2 ([-1,0]), 1 ([-2,-1]), 0 (<-2)
  const clamped = Math.max(value, -2.8);
  return Math.max(4, 3 * slot + (clamped / 3) * (3 * slot));
}

interface RDistributionProps {
  stats: JournalStatsWithNulls;
  className?: string;
}

export function RDistribution({ stats, className }: RDistributionProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const rawId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const data = stats.rDistribution ?? [];
  const maxCount = Math.max(1, ...data.map((bucket) => bucket.count));
  const total = data.reduce((sum, bucket) => sum + bucket.count, 0);
  const avgR = stats.avgR;

  const ticks = useMemo(() => {
    const step = Math.max(1, Math.ceil(maxCount / 3));
    const domain = Math.ceil(maxCount / step) * step;
    return Array.from({ length: domain / step + 1 }, (_, index) => index * step);
  }, [maxCount]);
  const domainMax = Math.max(maxCount, ...ticks);
  const yFor = (count: number) => Y_BOTTOM - (count / Math.max(domainMax, 1)) * (Y_BOTTOM - Y_TOP);
  const avgIndex =
    avgR === null || data.length === 0 ? null : Math.min(data.length - 1, bucketIndexForR(avgR));
  const slot = 100 / Math.max(data.length, 1);
  const xFor = (index: number) => index * slot + slot / 2;
  const avgX = avgR === null || data.length === 0 ? null : continuousXForR(avgR, data.length);
  const hoveredData = hovered !== null ? (data[hovered] ?? null) : null;

  return (
    <Card
      as="section"
      aria-label="R-multiple distribution histogram"
      className={cn('gap-3.5', className)}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-fg-subtle font-mono text-[11px] font-semibold tracking-wider uppercase">
            R Distribution
          </span>
          <ChartLegend
            shape="bar"
            items={[
              { label: 'Win', tone: 'bull' },
              { label: 'Loss', tone: 'bear' },
            ]}
          />
          <span className="text-fg-subtle flex items-center gap-1.5 font-mono text-[9px] tracking-wider uppercase">
            <span
              className="h-2 w-2 rounded-[2px] border border-white/10"
              style={{ backgroundImage: TAIL_HATCH_CSS }}
              aria-hidden="true"
            />
            Tail
          </span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px]">
          {avgR !== null ? (
            <span className="border-border/60 bg-bg-elev-2 text-fg-muted rounded-full border px-2 py-0.5 tabular-nums">
              AVG{' '}
              <span className="text-brand font-semibold">
                {avgR >= 0 ? '+' : ''}
                {avgR.toFixed(2)}R
              </span>
            </span>
          ) : null}
          <span className="text-fg-muted tabular-nums">{total} trades</span>
        </div>
      </header>

      {total === 0 ? (
        <div className="surface-well relative h-48 overflow-hidden rounded-xl">
          <div className="absolute inset-x-0 bottom-0 flex h-28 items-end gap-2 px-6 opacity-25">
            {[18, 32, 55, 80, 48, 28, 14, 6].map((height, index) => (
              <div
                key={index}
                className="bg-fg-subtle/50 flex-1 rounded-t-sm"
                style={{ height: `${height}%` }}
                aria-hidden="true"
              />
            ))}
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-4 text-center">
            <p className="text-fg text-xs font-medium">No closed trades yet</p>
            <p className="text-fg-subtle max-w-xs text-[11px] leading-relaxed">
              Close a trade to build your R distribution.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="relative h-52">
            <div className="absolute inset-y-0 left-0 w-7" aria-hidden="true">
              {ticks.map((tick) => (
                <span
                  key={`y-${tick}`}
                  className="text-fg-subtle absolute right-1.5 -translate-y-1/2 font-mono text-[9px] tabular-nums"
                  style={{ top: `${yFor(tick)}%` }}
                >
                  {tick}
                </span>
              ))}
            </div>

            <div className="surface-well absolute inset-y-0 right-0 left-7 overflow-hidden rounded-xl">
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="absolute inset-0 h-full w-full"
                role="img"
                aria-label={`R-multiple distribution over ${total} trades`}
              >
                <defs>
                  <linearGradient id={`${rawId}-bull`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-positive)" stopOpacity="0.92" />
                    <stop offset="100%" stopColor="var(--chart-positive)" stopOpacity="0.32" />
                  </linearGradient>
                  <linearGradient id={`${rawId}-bear`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-negative)" stopOpacity="0.92" />
                    <stop offset="100%" stopColor="var(--chart-negative)" stopOpacity="0.32" />
                  </linearGradient>
                  <linearGradient id={`${rawId}-neutral`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-fg-subtle)" stopOpacity="0.6" />
                    <stop offset="100%" stopColor="var(--color-fg-subtle)" stopOpacity="0.2" />
                  </linearGradient>
                </defs>

                {ticks.map((tick) => (
                  <line
                    key={`grid-${tick}`}
                    x1="0"
                    x2="100"
                    y1={yFor(tick)}
                    y2={yFor(tick)}
                    stroke="var(--chart-grid)"
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}

                <line
                  x1="0"
                  x2="100"
                  y1={Y_BOTTOM}
                  y2={Y_BOTTOM}
                  stroke="var(--color-fg-subtle)"
                  strokeOpacity="0.45"
                  strokeDasharray="2 4"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />

                {data.map((bucket, index) => {
                  const tone = bucketTone(bucket.bucket);
                  const top = yFor(bucket.count);
                  const height = Math.max(Y_BOTTOM - top, bucket.count > 0 ? 0.8 : 0);
                  const width = slot * 0.56;
                  return (
                    <m.rect
                      key={bucket.bucket}
                      x={xFor(index) - width / 2}
                      y={top}
                      width={width}
                      height={height}
                      fill={`url(#${rawId}-${tone})`}
                      opacity={hovered === null || hovered === index ? 0.95 : 0.45}
                      initial={{ scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{
                        duration: 0.5,
                        delay: index * 0.03,
                        ease: [0.32, 0.72, 0, 1],
                      }}
                      style={{ transformBox: 'fill-box', transformOrigin: 'bottom' }}
                    />
                  );
                })}

                {avgX !== null ? (
                  <line
                    x1={avgX}
                    x2={avgX}
                    y1={Y_TOP}
                    y2={Y_BOTTOM}
                    stroke="var(--chart-line-primary)"
                    strokeOpacity={0.85}
                    strokeDasharray="2 3"
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null}
              </svg>

              {/* True-aspect CSS diagonal hatch overlay on the two tail buckets */}
              {data.map((bucket, index) => {
                const isTail = index === 0 || index === data.length - 1;
                if (!isTail || bucket.count <= 0) return null;
                const top = yFor(bucket.count);
                const height = Math.max(Y_BOTTOM - top, 0.8);
                const width = slot * 0.56;
                return (
                  <div
                    key={`hatch-${bucket.bucket}`}
                    className="pointer-events-none absolute"
                    style={{
                      left: `${xFor(index) - width / 2}%`,
                      top: `${top}%`,
                      width: `${width}%`,
                      height: `${height}%`,
                      backgroundImage: TAIL_HATCH_CSS,
                    }}
                    aria-hidden="true"
                  />
                );
              })}

              {avgX !== null ? (
                <span
                  className="bg-brand pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[#0d0e10]"
                  style={{ left: `${avgX}%`, top: `${Y_TOP}%` }}
                  aria-hidden="true"
                />
              ) : null}

              <div className="absolute inset-0 flex">
                {data.map((bucket, index) => (
                  <button
                    key={`hover-${bucket.bucket}`}
                    type="button"
                    className="h-full flex-1 cursor-crosshair focus-visible:ring-1 focus-visible:ring-brand/50 focus-visible:outline-none"
                    aria-label={`${bucket.bucket}: ${bucket.count} trades, ${Math.round((bucket.count / total) * 100)}%`}
                    onMouseEnter={() => setHovered(index)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(index)}
                    onBlur={() => setHovered(null)}
                  />
                ))}
              </div>

              {hoveredData ? (
                <ChartTooltip
                  x={xFor(hovered ?? 0)}
                  y={yFor(hoveredData.count)}
                  title={hoveredData.bucket}
                  rows={[
                    {
                      label: 'Trades',
                      value: hoveredData.count,
                      tone: bucketTone(hoveredData.bucket),
                    },
                    {
                      label: 'Share',
                      value: `${Math.round((hoveredData.count / total) * 100)}%`,
                    },
                    ...(avgR !== null && hovered === avgIndex
                      ? [{ label: 'Average', value: `${avgR.toFixed(2)}R`, tone: 'brand' as const }]
                      : []),
                  ]}
                />
              ) : null}
            </div>
          </div>

          <div
            className="grid gap-1 pl-7"
            style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}
          >
            {data.map((bucket) => (
              <span
                key={`label-${bucket.bucket}`}
                className={cn(
                  'text-center font-mono text-[9px] tabular-nums',
                  LABEL_TONE[bucketTone(bucket.bucket)],
                )}
              >
                {bucket.bucket}
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
