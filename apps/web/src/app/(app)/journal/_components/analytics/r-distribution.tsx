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
// bullish, and the two tail buckets carry a diagonal hatch so the fat-tail
// risk is visible without reading the labels. Hovering or focusing a bar
// reveals its count and share; the average R sits on the bucket axis as a
// reference line.
import type { JournalStatsWithNulls } from '@kestrel/shared';
import { useState } from 'react';

import { Card } from '@/components/ui/card';
import { cn } from '@/lib/formatters/cn';

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

const TAIL_HATCH =
  'repeating-linear-gradient(45deg, transparent 0 3px, rgba(255,255,255,0.22) 3px 4px)';

type BucketTone = 'bull' | 'bear' | 'neutral';

const BAR_TONE: Record<BucketTone, string> = {
  bull: 'bg-bull/60',
  bear: 'bg-bear/60',
  neutral: 'bg-fg-subtle/35',
};

function bucketTone(bucket: string): BucketTone {
  if (bucket === '[0,0]') return 'neutral';
  return bucket.startsWith('[-') ? 'bear' : 'bull';
}

function bucketIndexForR(value: number): number {
  for (let index = 0; index < BUCKET_BOUNDS.length; index++) {
    const [min, max] = BUCKET_BOUNDS[index] ?? [-Infinity, Infinity];
    if (value >= min && value <= max) return index;
  }
  return value < 0 ? 0 : BUCKET_BOUNDS.length - 1;
}

interface RDistributionProps {
  stats: JournalStatsWithNulls;
  className?: string;
}

export function RDistribution({ stats, className }: RDistributionProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const data = stats.rDistribution ?? [];
  const maxCount = Math.max(1, ...data.map((bucket) => bucket.count));
  const total = data.reduce((sum, bucket) => sum + bucket.count, 0);
  const avgR = stats.avgR;

  const avgIndex =
    avgR === null || data.length === 0 ? null : Math.min(data.length - 1, bucketIndexForR(avgR));

  return (
    <Card
      as="section"
      aria-label="R-multiple distribution histogram"
      className={cn('gap-3', className)}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="text-fg-subtle font-mono text-[11px] font-semibold tracking-wider uppercase">
            R Distribution
          </span>
          {total > 0 ? (
            <span className="text-fg-subtle flex items-center gap-1 font-mono text-[9px] tracking-wider uppercase">
              <span
                className="border-border/60 h-2.5 w-2.5 rounded-[2px] border"
                style={{ backgroundImage: TAIL_HATCH }}
                aria-hidden="true"
              />
              Tail
            </span>
          ) : null}
        </div>
        <span className="text-fg-muted font-mono text-[10px] tabular-nums">{total} trades</span>
      </header>

      {total === 0 ? (
        <div className="relative h-40">
          <div className="absolute inset-x-0 bottom-0 flex h-24 items-end gap-1 opacity-20">
            {[18, 32, 55, 80, 48, 28, 14, 6].map((height, index) => (
              <div
                key={index}
                className="bg-fg-subtle/50 flex-1 rounded-t"
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
          <div className="relative h-44">
            {avgIndex !== null && avgR !== null ? (
              <>
                <span
                  className="border-brand/60 absolute inset-y-0 border-l border-dashed"
                  style={{ left: `${((avgIndex + 0.5) / data.length) * 100}%` }}
                  aria-hidden="true"
                />
                <span
                  className="surface-chip text-brand absolute top-0 z-10 rounded-md px-1.5 py-0.5 font-mono text-[9px] font-semibold whitespace-nowrap tabular-nums"
                  style={{
                    left: `${Math.min(92, Math.max(8, ((avgIndex + 0.5) / data.length) * 100))}%`,
                    translate: '-50% 0',
                  }}
                >
                  AVG {avgR >= 0 ? '+' : ''}
                  {avgR.toFixed(2)}R
                </span>
              </>
            ) : null}

            <div className="absolute inset-x-0 top-9 bottom-0 flex items-end gap-1">
              {data.map((bucket, index) => {
                const tone = bucketTone(bucket.bucket);
                const heightPct = (bucket.count / maxCount) * 100;
                const isTail = index === 0 || index === data.length - 1;

                return (
                  <div
                    key={bucket.bucket}
                    role="img"
                    tabIndex={0}
                    aria-label={`${bucket.bucket}: ${bucket.count} trades, ${Math.round(
                      (bucket.count / total) * 100,
                    )}%`}
                    onMouseEnter={() => setHovered(index)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(index)}
                    onBlur={() => setHovered(null)}
                    className="focus-visible:ring-brand/40 relative flex-1 rounded-sm outline-none focus-visible:ring-2"
                    style={{ height: `${Math.max(heightPct, bucket.count > 0 ? 4 : 0)}%` }}
                  >
                    <div className={cn('absolute inset-0 rounded-t', BAR_TONE[tone])} />
                    {isTail ? (
                      <div
                        className="absolute inset-0 rounded-t opacity-60"
                        style={{ backgroundImage: TAIL_HATCH }}
                        aria-hidden="true"
                      />
                    ) : null}

                    {bucket.count > 0 ? (
                      <span className="text-fg-subtle absolute inset-x-0 -top-4 text-center font-mono text-[10px] tabular-nums">
                        {bucket.count}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {hovered !== null && data[hovered] ? (
              <div
                className="surface-chip text-fg pointer-events-none absolute bottom-0 z-10 rounded-md px-1.5 py-0.5 font-mono text-[9px] whitespace-nowrap tabular-nums"
                style={{
                  left: `${Math.min(88, Math.max(12, ((hovered + 0.5) / data.length) * 100))}%`,
                  translate: '-50% 0',
                }}
              >
                {data[hovered].bucket} · {data[hovered].count} ·{' '}
                {Math.round((data[hovered].count / total) * 100)}%
              </div>
            ) : null}
          </div>

          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}
          >
            {data.map((bucket) => (
              <span
                key={`label-${bucket.bucket}`}
                className="text-fg-subtle text-center font-mono text-[9px] tabular-nums"
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
