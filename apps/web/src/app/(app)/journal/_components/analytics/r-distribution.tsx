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

// Histogram of R-multiple buckets rendered on `bklit-tanstack-charts` BarChart
// with column tracks, gradient fills, hover focus dimming, and keyboard navigation.
import type { JournalStatsWithNulls } from '@kestrel/shared';
import {
  Bar,
  BarChart,
  BarColumnTrack,
  BarXAxis,
  BarYAxis,
  ChartTooltip,
  Grid,
  LinearGradient,
} from 'bklit-tanstack-charts';
import { useId, useMemo } from 'react';

import { ChartLegend } from '@/components/chart/chart-ui';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/formatters/cn';

type BucketTone = 'bull' | 'bear' | 'neutral';

function bucketTone(bucket: string): BucketTone {
  if (bucket === '[0,0]') return 'neutral';
  return bucket.startsWith('[-') || bucket.startsWith('<') ? 'bear' : 'bull';
}

interface RDistributionProps {
  stats: JournalStatsWithNulls;
  className?: string;
}

export function RDistribution({ stats, className }: RDistributionProps) {
  const rawId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const data = useMemo(() => stats.rDistribution ?? [], [stats.rDistribution]);
  const total = data.reduce((sum, bucket) => sum + bucket.count, 0);
  const avgR = stats.avgR;

  const rows = useMemo(
    () =>
      data.map((bucket) => {
        const tone = bucketTone(bucket.bucket);
        return {
          bucket: bucket.bucket,
          Wins: tone === 'bull' ? bucket.count : 0,
          Losses: tone === 'bear' ? bucket.count : 0,
          Breakeven: tone === 'neutral' ? bucket.count : 0,
        };
      }),
    [data],
  );

  const hasBreakeven = rows.some((row) => row.Breakeven > 0);

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
              ...(hasBreakeven ? [{ label: 'Flat', tone: 'neutral' as const }] : []),
            ]}
          />
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
        <div className="surface-well relative h-56 overflow-hidden rounded-xl border border-white/[0.05]">
          <BarChart
            data={rows}
            xDataKey="bucket"
            stacked
            barGap={0.28}
            aspectRatio="unset"
            style={{ height: '100%', aspectRatio: 'unset' }}
            margin={{ top: 18, right: 16, bottom: 30, left: 34 }}
            ariaLabel={`R-multiple distribution over ${total} trades`}
          >
            <LinearGradient
              id={`${rawId}-bull`}
              from="var(--chart-positive)"
              to="var(--chart-positive)"
              fromOpacity={0.95}
              toOpacity={0.35}
            />
            <LinearGradient
              id={`${rawId}-bear`}
              from="var(--chart-negative)"
              to="var(--chart-negative)"
              fromOpacity={0.95}
              toOpacity={0.35}
            />
            <Grid horizontal numTicksRows={4} />
            <BarColumnTrack />
            <Bar
              dataKey="Wins"
              fill={`url(#${rawId}-bull)`}
              stroke="var(--chart-positive)"
              lineCap="round"
            />
            <Bar
              dataKey="Losses"
              fill={`url(#${rawId}-bear)`}
              stroke="var(--chart-negative)"
              lineCap="round"
            />
            {hasBreakeven ? (
              <Bar
                dataKey="Breakeven"
                fill="var(--color-fg-subtle)"
                stroke="var(--color-fg-subtle)"
                lineCap="round"
              />
            ) : null}
            <BarXAxis showAllLabels />
            <BarYAxis numTicks={4} formatLargeNumbers={false} />
            <ChartTooltip />
          </BarChart>
        </div>
      )}
    </Card>
  );
}
