'use client';

// SPDX-License-Identifier: Apache-2.0

// Daily realised-R bars and cumulative equity line rendered via
// `bklit-tanstack-charts` ComposedChart (`SeriesBar` + `Area` + `Line`).
import type { JournalEntry } from '@kestrel/shared';
import {
  Area,
  ChartTooltip,
  ComposedChart,
  Grid,
  Line,
  SeriesBar,
  TooltipContent,
  XAxis,
  YAxis,
} from 'bklit-tanstack-charts';
import { useMemo } from 'react';

import { ChartLegend } from '@/components/chart/chart-ui';
import { Card } from '@/components/ui/card';

const BASE_EPOCH_MS = Date.UTC(2026, 0, 1);
const DAY_MS = 86_400_000;

interface DayRow extends Record<string, unknown> {
  date: Date;
  key: string;
  label: string;
  dailyR: number;
  dailyGain: number;
  dailyLoss: number;
  trades: number;
  cumulative: number;
}

function buildDays(entries: readonly JournalEntry[]): {
  days: DayRow[];
  labelByTime: Map<number, string>;
} {
  const byDay = new Map<string, { dailyR: number; trades: number }>();
  for (const entry of entries) {
    if (entry.outcome === 'open' || entry.rMultiple === null) continue;
    if (entry.closedAt === null || entry.closedAt === undefined) continue;
    const key = new Date(entry.closedAt).toISOString().slice(0, 10);
    const bucket = byDay.get(key) ?? { dailyR: 0, trades: 0 };
    bucket.dailyR += entry.rMultiple;
    bucket.trades += 1;
    byDay.set(key, bucket);
  }

  let cumulative = 0;
  const labelByTime = new Map<number, string>();
  const days = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, bucket], index) => {
      cumulative += bucket.dailyR;
      const time = BASE_EPOCH_MS + index * DAY_MS;
      const label = key.slice(5);
      labelByTime.set(time, label);
      return {
        date: new Date(time),
        key,
        label,
        dailyR: bucket.dailyR,
        dailyGain: bucket.dailyR > 0 ? bucket.dailyR : 0,
        dailyLoss: bucket.dailyR < 0 ? bucket.dailyR : 0,
        trades: bucket.trades,
        cumulative,
      };
    });

  return { days, labelByTime };
}

function signedR(value: number, decimals = 2): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}R`;
}

export function JournalComposedChart({ entries }: { entries: readonly JournalEntry[] }) {
  const { days, labelByTime } = useMemo(() => buildDays(entries), [entries]);

  if (days.length === 0) {
    return (
      <Card as="section" aria-label="Daily results and equity" className="gap-3">
        <span className="text-fg-subtle font-mono text-[11px] font-semibold tracking-wider uppercase">
          Daily results &amp; equity
        </span>
        <div className="surface-well relative h-48 overflow-hidden rounded-xl">
          <div className="absolute inset-x-0 bottom-0 flex h-28 items-end gap-2 px-6 opacity-25">
            {[18, 34, 62, 40, 76, 52, 28, 12].map((height, index) => (
              <div
                key={index}
                className="bg-fg-subtle/50 flex-1 rounded-t-sm"
                style={{ height: `${height}%` }}
                aria-hidden="true"
              />
            ))}
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-4 text-center">
            <p className="text-fg text-xs font-medium">No daily results yet</p>
            <p className="text-fg-subtle max-w-xs text-[11px] leading-relaxed">
              Close a trade to plot daily R and the cumulative equity line.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const totalR = days[days.length - 1]?.cumulative ?? 0;

  return (
    <Card as="section" aria-label="Daily results and equity" className="gap-3.5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-fg-subtle font-mono text-[11px] font-semibold tracking-wider uppercase">
            Daily results &amp; equity
          </span>
          <ChartLegend
            shape="bar"
            items={[
              { label: 'Daily R', tone: 'bull', dualTone: ['bull', 'bear'] },
              { label: 'Cumulative', tone: 'brand' },
            ]}
          />
        </div>
        <span
          className={`font-mono text-[10px] font-semibold tabular-nums ${totalR >= 0 ? 'text-bull' : 'text-bear'}`}
        >
          Net {signedR(totalR)}
        </span>
      </header>

      <div className="surface-well relative h-60 overflow-hidden rounded-xl border border-white/[0.05]">
        <ComposedChart
          data={days}
          xDataKey="date"
          stacked
          maxBarSize={28}
          aspectRatio="unset"
          className="h-full w-full"
          margin={{ top: 18, right: 20, bottom: 30, left: 46 }}
          ariaLabel={`Daily R bars and cumulative equity over ${days.length} trading days, net ${totalR.toFixed(2)}R`}
        >
          <Grid
            horizontal
            numTicksRows={4}
            highlightRowValues={[0]}
            highlightRowStroke="var(--color-fg-subtle)"
            highlightRowStrokeOpacity={0.45}
          />
          <Area
            dataKey="cumulative"
            stroke="var(--chart-line-primary)"
            fill="var(--chart-line-primary)"
            fillOpacity={0.16}
            showLine={false}
          />
          <SeriesBar
            dataKey="dailyGain"
            fill="var(--chart-positive)"
            stroke="var(--chart-positive)"
            radius={4}
          />
          <SeriesBar
            dataKey="dailyLoss"
            fill="var(--chart-negative)"
            stroke="var(--chart-negative)"
            radius={4}
          />
          <Line
            dataKey="cumulative"
            stroke="var(--chart-line-primary)"
            strokeWidth={2.25}
            fadeEdges={false}
          />
          <XAxis
            numTicks={Math.min(6, days.length)}
            formatValue={(date) => labelByTime.get(date.getTime()) ?? ''}
          />
          <YAxis
            numTicks={4}
            formatLargeNumbers={false}
            formatValue={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}R`}
          />
          <ChartTooltip
            showDatePill={false}
            content={({ point }) => {
              const row = point as DayRow;
              const daily = typeof row.dailyR === 'number' ? row.dailyR : 0;
              const cum = typeof row.cumulative === 'number' ? row.cumulative : 0;
              const trades = typeof row.trades === 'number' ? row.trades : 0;
              return (
                <TooltipContent
                  title={typeof row.key === 'string' ? row.key : undefined}
                  rows={[
                    {
                      color: daily >= 0 ? 'var(--chart-positive)' : 'var(--chart-negative)',
                      label: 'Daily R',
                      value: signedR(daily),
                    },
                    {
                      color: 'var(--chart-line-primary)',
                      label: 'Cumulative',
                      value: signedR(cum),
                    },
                    {
                      color: 'var(--color-fg-subtle)',
                      label: 'Trades',
                      value: String(trades),
                    },
                  ]}
                />
              );
            }}
          />
        </ComposedChart>
      </div>
    </Card>
  );
}
