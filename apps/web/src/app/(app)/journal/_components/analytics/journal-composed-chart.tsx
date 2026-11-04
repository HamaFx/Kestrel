'use client';

// SPDX-License-Identifier: Apache-2.0

// Daily realised-R bars and the cumulative equity line on one composed chart.
// Left axis: daily R. Right axis: cumulative R. The bars answer “what happened
// each day”; the line answers “where did the account end up”.
import type { JournalEntry } from '@kestrel/shared';
import { m } from 'motion/react';
import { useId, useMemo, useState } from 'react';

import { ChartLegend, ChartTooltip } from '@/components/chart/chart-ui';
import { niceTicks, smoothPath } from '@/components/chart/chart-geometry';
import { Card } from '@/components/ui/card';

const Y_TOP = 5;
const Y_BOTTOM = 92;

interface DayRow {
  key: string;
  label: string;
  dailyR: number;
  trades: number;
  cumulative: number;
}

function buildDays(entries: readonly JournalEntry[]): DayRow[] {
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
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, bucket]) => {
      cumulative += bucket.dailyR;
      return {
        key,
        label: key.slice(5),
        dailyR: bucket.dailyR,
        trades: bucket.trades,
        cumulative,
      };
    });
}

function signedR(value: number, decimals = 2): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}R`;
}

export function JournalComposedChart({ entries }: { entries: readonly JournalEntry[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const rawId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const days = useMemo(() => buildDays(entries), [entries]);

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
  const dailyTicks = niceTicks(
    Math.min(0, ...days.map((day) => day.dailyR)),
    Math.max(0, ...days.map((day) => day.dailyR)),
    3,
  );
  const cumTicks = niceTicks(
    Math.min(0, ...days.map((day) => day.cumulative)),
    Math.max(0, ...days.map((day) => day.cumulative)),
    3,
  );
  const dailyMin = Math.min(...dailyTicks);
  const dailyMax = Math.max(...dailyTicks);
  const cumMin = Math.min(...cumTicks);
  const cumMax = Math.max(...cumTicks);
  const yDaily = (value: number) =>
    Y_BOTTOM - ((value - dailyMin) / Math.max(dailyMax - dailyMin, 1)) * (Y_BOTTOM - Y_TOP);
  const yCum = (value: number) =>
    Y_BOTTOM - ((value - cumMin) / Math.max(cumMax - cumMin, 1)) * (Y_BOTTOM - Y_TOP);
  const zeroDaily = yDaily(0);
  const slot = 100 / days.length;
  const xFor = (index: number) => index * slot + slot / 2;

  const linePoints = days.map((day, index) => ({ x: xFor(index), y: yCum(day.cumulative) }));
  const line = smoothPath(linePoints);
  const area = `${line} L 100 ${Y_BOTTOM} L 0 ${Y_BOTTOM} Z`;
  const hoveredDay = hovered !== null ? (days[hovered] ?? null) : null;
  const mid = days[Math.floor((days.length - 1) / 2)];

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
              { label: 'Daily R', tone: 'bull' },
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

      <div className="relative h-56">
        <div className="absolute inset-y-0 left-0 w-7" aria-hidden="true">
          {dailyTicks.map((tick) => (
            <span
              key={`left-${tick}`}
              className="text-fg-subtle absolute right-1 -translate-y-1/2 font-mono text-[9px] tabular-nums"
              style={{ top: `${yDaily(tick)}%` }}
            >
              {tick}
            </span>
          ))}
        </div>
        <div className="absolute inset-y-0 right-0 w-8" aria-hidden="true">
          {cumTicks.map((tick) => (
            <span
              key={`right-${tick}`}
              className="text-brand/80 absolute left-1 -translate-y-1/2 font-mono text-[9px] tabular-nums"
              style={{ top: `${yCum(tick)}%` }}
            >
              {tick}
            </span>
          ))}
        </div>

        <div className="absolute inset-y-0 right-8 left-7">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full overflow-visible"
            role="img"
            aria-label={`Daily R bars and cumulative equity over ${days.length} trading days, net ${totalR.toFixed(2)}R`}
          >
            <defs>
              <linearGradient id={`${rawId}-bull`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-positive)" stopOpacity="0.9" />
                <stop offset="100%" stopColor="var(--chart-positive)" stopOpacity="0.3" />
              </linearGradient>
              <linearGradient id={`${rawId}-bear`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-negative)" stopOpacity="0.9" />
                <stop offset="100%" stopColor="var(--chart-negative)" stopOpacity="0.3" />
              </linearGradient>
              <linearGradient id={`${rawId}-area`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-line-primary)" stopOpacity="0.16" />
                <stop offset="100%" stopColor="var(--chart-line-primary)" stopOpacity="0" />
              </linearGradient>
            </defs>

            {dailyTicks.map((tick) => (
              <line
                key={`grid-${tick}`}
                x1="0"
                x2="100"
                y1={yDaily(tick)}
                y2={yDaily(tick)}
                stroke="var(--chart-grid)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}

            <line
              x1="0"
              x2="100"
              y1={zeroDaily}
              y2={zeroDaily}
              stroke="var(--color-fg-subtle)"
              strokeOpacity={0.4}
              strokeDasharray="2 4"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />

            {days.map((day, index) => {
              const top = Math.min(yDaily(day.dailyR), zeroDaily);
              const height = Math.max(
                Math.abs(yDaily(day.dailyR) - zeroDaily),
                day.dailyR === 0 ? 0 : 0.8,
              );
              const width = slot * 0.5;
              return (
                <m.rect
                  key={day.key}
                  x={xFor(index) - width / 2}
                  y={top}
                  width={width}
                  height={height}
                  rx={0.6}
                  fill={day.dailyR >= 0 ? `url(#${rawId}-bull)` : `url(#${rawId}-bear)`}
                  opacity={hovered === null || hovered === index ? 0.95 : 0.45}
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ duration: 0.5, delay: index * 0.02, ease: [0.32, 0.72, 0, 1] }}
                  style={{ transformBox: 'fill-box', transformOrigin: 'bottom' }}
                />
              );
            })}

            <m.path
              d={area}
              fill={`url(#${rawId}-area)`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6 }}
            />
            <m.path
              d={line}
              fill="none"
              stroke="var(--chart-line-primary)"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
            />

            {hovered !== null && days[hovered] ? (
              <line
                x1={xFor(hovered)}
                x2={xFor(hovered)}
                y1="0"
                y2="100"
                stroke="var(--color-fg-subtle)"
                strokeOpacity={0.5}
                strokeDasharray="2 2"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
          </svg>

          <div className="absolute inset-0 flex">
            {days.map((day, index) => (
              <button
                key={`hover-${day.key}`}
                type="button"
                className="h-full flex-1 cursor-default focus-visible:ring-1 focus-visible:ring-brand/50 focus-visible:outline-none"
                aria-label={`${day.key}: ${signedR(day.dailyR)}, cumulative ${signedR(day.cumulative)}, ${day.trades} trades`}
                onMouseEnter={() => setHovered(index)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(index)}
                onBlur={() => setHovered(null)}
              />
            ))}
          </div>

          {hoveredDay !== null && hovered !== null ? (
            <ChartTooltip
              x={xFor(hovered)}
              y={yCum(hoveredDay.cumulative)}
              title={hoveredDay.key}
              rows={[
                {
                  label: 'Daily',
                  value: signedR(hoveredDay.dailyR),
                  tone: hoveredDay.dailyR >= 0 ? 'bull' : 'bear',
                },
                { label: 'Equity', value: signedR(hoveredDay.cumulative), tone: 'brand' },
                { label: 'Trades', value: hoveredDay.trades },
              ]}
            />
          ) : null}
        </div>
      </div>

      <div className="text-fg-subtle flex justify-between pr-8 pl-7 font-mono text-[9px]">
        <span>{days[0]?.label}</span>
        <span>{mid?.label}</span>
        <span>{days[days.length - 1]?.label}</span>
      </div>
    </Card>
  );
}
