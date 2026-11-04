'use client';

// SPDX-License-Identifier: Apache-2.0

// Daily realised-R bars and the cumulative equity line on one shared price
// scale. This is the analytics-tab overview that replaces the disconnected
// mini-chart stack: bars answer “what happened each day”, the line answers
// “where did the account end up”.
import type { JournalEntry } from '@kestrel/shared';
import { useMemo, useRef, useState } from 'react';

import { Card } from '@/components/ui/card';

const Y_TOP = 10;
const Y_BOTTOM = 90;

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

export function JournalComposedChart({ entries }: { entries: readonly JournalEntry[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const plotRef = useRef<HTMLDivElement | null>(null);
  const days = useMemo(() => buildDays(entries), [entries]);

  if (days.length === 0) {
    return (
      <Card as="section" aria-label="Daily results and equity" className="gap-3">
        <div className="flex items-center justify-between">
          <span className="text-fg-subtle font-mono text-[11px] font-semibold tracking-wider uppercase">
            Daily results &amp; equity
          </span>
        </div>
        <div className="relative h-40">
          <div className="absolute inset-x-0 bottom-0 flex h-24 items-end gap-1 opacity-20">
            {[18, 34, 62, 40, 76, 52, 28, 12].map((height, index) => (
              <div
                key={index}
                className="bg-fg-subtle/50 flex-1 rounded-t"
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

  const values = days.flatMap((day) => [day.dailyR, day.cumulative]);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const padding = (max - min) * 0.08 || 1;
  const low = min - padding;
  const high = max + padding;
  const span = high - low || 1;
  const yFor = (value: number) => Y_TOP + (1 - (value - low) / span) * (Y_BOTTOM - Y_TOP);
  const slot = 100 / days.length;
  const xFor = (index: number) => index * slot + slot / 2;
  const zeroY = yFor(0);

  const line = days
    .map(
      (day, index) =>
        `${index === 0 ? 'M' : 'L'} ${xFor(index)} ${yFor(day.cumulative).toFixed(2)}`,
    )
    .join(' ');

  const hoveredDay = hovered !== null ? days[hovered] : null;
  const totalR = days[days.length - 1]?.cumulative ?? 0;

  const indexFromClientX = (clientX: number): number | null => {
    const element = plotRef.current;
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.min(days.length - 1, Math.floor(ratio * days.length));
  };

  return (
    <Card as="section" aria-label="Daily results and equity" className="gap-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-fg-subtle font-mono text-[11px] font-semibold tracking-wider uppercase">
          Daily results &amp; equity
        </span>
        <div className="flex items-center gap-3 font-mono text-[10px] tabular-nums">
          {hoveredDay ? (
            <>
              <span className="text-fg-subtle">{hoveredDay.key}</span>
              <span className={hoveredDay.dailyR >= 0 ? 'text-bull' : 'text-bear'}>
                {hoveredDay.dailyR >= 0 ? '+' : ''}
                {hoveredDay.dailyR.toFixed(2)}R
              </span>
              <span className="text-fg-muted">
                {hoveredDay.cumulative >= 0 ? '+' : ''}
                {hoveredDay.cumulative.toFixed(2)}R
              </span>
            </>
          ) : (
            <span className={totalR >= 0 ? 'text-bull' : 'text-bear'}>
              Net {totalR >= 0 ? '+' : ''}
              {totalR.toFixed(2)}R
            </span>
          )}
        </div>
      </header>

      <div
        role="img"
        aria-label={`Daily R bars and cumulative equity over ${days.length} trading days, net ${totalR.toFixed(2)}R`}
        className="surface-well relative h-44 touch-pan-y overflow-hidden rounded-xl"
        onPointerMove={(event) => setHovered(indexFromClientX(event.clientX))}
        onPointerLeave={() => setHovered(null)}
        onPointerDown={(event) => setHovered(indexFromClientX(event.clientX))}
      >
        <div ref={plotRef} className="absolute inset-y-0 right-2 left-2">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            <line
              x1="0"
              x2="100"
              y1={zeroY}
              y2={zeroY}
              stroke="var(--color-fg-subtle)"
              strokeOpacity={0.35}
              strokeDasharray="2 4"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />

            {days.map((day, index) => {
              const barTop = Math.min(yFor(day.dailyR), zeroY);
              const barHeight = Math.max(Math.abs(yFor(day.dailyR) - zeroY), 0.8);
              return (
                <rect
                  key={day.key}
                  x={xFor(index) - slot * 0.28}
                  y={barTop}
                  width={slot * 0.56}
                  height={barHeight}
                  fill={day.dailyR >= 0 ? 'var(--chart-positive)' : 'var(--chart-negative)'}
                  fillOpacity={hovered === null || hovered === index ? 0.6 : 0.3}
                  rx="0.5"
                />
              );
            })}

            <path
              d={line}
              fill="none"
              stroke="var(--chart-line-primary)"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />

            {hovered !== null ? (
              <line
                x1={xFor(hovered)}
                x2={xFor(hovered)}
                y1="0"
                y2="100"
                stroke="var(--color-fg-subtle)"
                strokeOpacity={0.55}
                strokeDasharray="2 2"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
          </svg>

          {hovered !== null && days[hovered] ? (
            <span
              className="bg-brand absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                left: `${xFor(hovered)}%`,
                top: `${yFor(days[hovered].cumulative)}%`,
              }}
              aria-hidden="true"
            />
          ) : null}
        </div>
      </div>

      <div className="text-fg-subtle flex justify-between font-mono text-[9px]">
        <span>{days[0]?.label}</span>
        <span>{days[Math.floor((days.length - 1) / 2)]?.label}</span>
        <span>{days[days.length - 1]?.label}</span>
      </div>
    </Card>
  );
}
