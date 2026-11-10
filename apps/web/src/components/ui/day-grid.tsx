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

// SPDX-License-Identifier: Apache-2.0

// <DayGrid> — PanelUI-inspired daily consistency & PnL intensity heatmap.
// Renders a week-column × 7-day matrix (`weeks` columns, default 16) with
// bipolar bull/bear intensity scaling for daily R-multiple outcomes, interactive
// hover/focus cell inspection, and a 5-stop polarity legend.

import { useMemo, useState } from 'react';

import { cn } from '@/lib/formatters/cn';

export interface DayGridDatum {
  /** ISO date string `YYYY-MM-DD` (UTC). */
  date: string;
  /** Net R-multiple or numeric score for the day. */
  value: number;
  /** Count of executions on that day. */
  count: number;
}

interface DayGridProps {
  data: readonly DayGridDatum[];
  weeks?: number;
  title?: string;
  className?: string;
}

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

function toUtcDateKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function cellToneClass(datum: DayGridDatum | undefined): string {
  if (!datum || datum.count === 0) {
    return 'bg-white/[0.04] border-white/[0.05]';
  }
  if (datum.value > 1.5) {
    return 'bg-bull border-bull/60 shadow-[0_0_6px_rgba(63,158,61,0.35)]';
  }
  if (datum.value > 0) {
    return 'bg-bull/45 border-bull/40';
  }
  if (datum.value < -1.5) {
    return 'bg-bear border-bear/60 shadow-[0_0_6px_rgba(240,62,62,0.35)]';
  }
  if (datum.value < 0) {
    return 'bg-bear/45 border-bear/40';
  }
  return 'bg-fg-muted/40 border-white/20';
}

export function DayGrid({
  data,
  weeks = 16,
  title = 'Daily Execution Consistency',
  className,
}: DayGridProps) {
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const { columns, byDate, activeSessions, netR } = useMemo(() => {
    const map = new Map<string, DayGridDatum>();
    let totalR = 0;
    let activeDays = 0;
    for (const item of data) {
      map.set(item.date, item);
      if (item.count > 0) {
        totalR += item.value;
        activeDays += 1;
      }
    }

    const now = new Date();
    const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const dayOfWeek = new Date(todayUtc).getUTCDay();
    const endOfCurrentWeek = todayUtc + (6 - dayOfWeek) * 86_400_000;
    const totalDays = weeks * 7;
    const startMs = endOfCurrentWeek - (totalDays - 1) * 86_400_000;

    const cols: Array<{ weekKey: string; days: Array<{ key: string; future: boolean }> }> = [];
    for (let w = 0; w < weeks; w++) {
      const days: Array<{ key: string; future: boolean }> = [];
      for (let d = 0; d < 7; d++) {
        const ms = startMs + (w * 7 + d) * 86_400_000;
        days.push({
          key: toUtcDateKey(ms),
          future: ms > todayUtc,
        });
      }
      cols.push({ weekKey: days[0]?.key ?? String(w), days });
    }

    return {
      columns: cols,
      byDate: map,
      activeSessions: activeDays,
      netR: totalR,
    };
  }, [data, weeks]);

  const activeDatum = activeKey ? byDate.get(activeKey) : undefined;

  return (
    <div
      data-slot="day-grid"
      className={cn(
        'surface-card flex flex-col gap-3 rounded-xl border border-white/[0.06] p-4',
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-fg-subtle font-mono text-[10px] font-semibold tracking-wider uppercase">
            {title}
          </span>
          <span className="text-fg-subtle font-mono text-[10px] tabular-nums">
            · {activeSessions} active {activeSessions === 1 ? 'day' : 'days'} (
            <span className={netR >= 0 ? 'text-bull' : 'text-bear'}>
              {netR >= 0 ? '+' : '−'}
              {Math.abs(netR).toFixed(2)}R
            </span>
            )
          </span>
        </div>

        <span className="text-fg-muted font-mono text-[10px] tabular-nums">
          {activeKey ? (
            activeDatum && activeDatum.count > 0 ? (
              <>
                {activeKey} · {activeDatum.count} {activeDatum.count === 1 ? 'trade' : 'trades'} ·{' '}
                <span className={activeDatum.value >= 0 ? 'text-bull' : 'text-bear'}>
                  {activeDatum.value >= 0 ? '+' : '−'}
                  {Math.abs(activeDatum.value).toFixed(2)}R
                </span>
              </>
            ) : (
              `${activeKey} · No closed trades`
            )
          ) : (
            `Last ${weeks} weeks`
          )}
        </span>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <div
          aria-hidden="true"
          className="text-fg-subtle/60 grid grid-rows-7 gap-1 pr-1 font-mono text-[8px] leading-none"
        >
          {WEEKDAY_LABELS.map((label, idx) => (
            <span key={idx} className="flex h-3 items-center">
              {idx % 2 === 1 ? label : ''}
            </span>
          ))}
        </div>

        <div className="flex gap-1" role="grid" aria-label={title}>
          {columns.map((col) => (
            <div key={col.weekKey} className="grid grid-rows-7 gap-1" role="row">
              {col.days.map((day) => {
                const datum = byDate.get(day.key);
                if (day.future) {
                  return (
                    <span
                      key={day.key}
                      aria-hidden="true"
                      className="size-3 rounded-[3px] border border-transparent bg-transparent"
                    />
                  );
                }
                const label =
                  datum && datum.count > 0
                    ? `${day.key}: ${datum.count} trades, ${datum.value >= 0 ? '+' : ''}${datum.value.toFixed(2)}R`
                    : `${day.key}: 0 trades`;
                return (
                  <button
                    key={day.key}
                    type="button"
                    role="gridcell"
                    aria-label={label}
                    onMouseEnter={() => setActiveKey(day.key)}
                    onMouseLeave={() => setActiveKey(null)}
                    onFocus={() => setActiveKey(day.key)}
                    onBlur={() => setActiveKey(null)}
                    className={cn(
                      'focus-visible:ring-brand size-3 rounded-[3px] border transition-transform hover:scale-125 focus-visible:ring-1 focus-visible:outline-none',
                      cellToneClass(datum),
                    )}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="text-fg-subtle flex items-center justify-end gap-1.5 font-mono text-[9px]">
        <span>Loss</span>
        <span className="bg-bear border-bear/60 size-2.5 rounded-[2px] border" />
        <span className="bg-bear/45 border-bear/40 size-2.5 rounded-[2px] border" />
        <span className="size-2.5 rounded-[2px] border border-white/[0.05] bg-white/[0.04]" />
        <span className="bg-bull/45 border-bull/40 size-2.5 rounded-[2px] border" />
        <span className="bg-bull border-bull/60 size-2.5 rounded-[2px] border" />
        <span>Win</span>
      </div>
    </div>
  );
}
