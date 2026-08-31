// SPDX-License-Identifier: Apache-2.0

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

// Phase 1.6 — Equity curve widget.
//
// Wraps the existing `PerformanceChart` so it fits the dashboard's
// widget chrome. We trim the chart's own header so the surrounding
// canvas label remains the primary visual anchor.
import type { JournalEntry } from '@kestrel/shared';
import { IconChartLine } from '@tabler/icons-react';
import { useMemo, useState } from 'react';

import { PerformanceChart } from '@/components/chart/performance-chart';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';

interface EquityCurveWidgetProps {
  entries: readonly JournalEntry[];
}

export function EquityCurveWidget({ entries }: EquityCurveWidgetProps) {
  const [timeframe, setTimeframe] = useState<'7d' | '30d' | 'all'>('all');

  const filteredEntries = useMemo(() => {
    if (timeframe === 'all') return entries;
    const now = Date.now();
    const cutoff = timeframe === '7d' ? now - 7 * 86400000 : now - 30 * 86400000;
    return entries.filter((e) => (e.closedAt ?? e.openedAt ?? 0) >= cutoff);
  }, [entries, timeframe]);

  const closed = filteredEntries.filter((e) => e.outcome !== 'open');
  const netR = closed.reduce((sum, e) => sum + (e.rMultiple ?? 0), 0);

  return (
    <Card as="section" aria-label="Equity curve">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconChartLine className="text-fg-subtle size-4" aria-hidden="true" />
          <div className="flex items-center gap-2">
            <h2 className="text-fg text-sm font-semibold">Performance</h2>
            <span
              className={cn(
                'text-xs rounded-2xs border px-2 py-0.5 font-mono font-bold tabular-nums',
                netR > 0
                  ? 'text-bull border-bull/30 bg-bull/10'
                  : netR < 0
                    ? 'text-bear border-bear/30 bg-bear/10'
                    : 'text-fg-muted border-border bg-bg-elev-2',
              )}
            >
              {netR >= 0 ? '+' : ''}
              {netR.toFixed(1)}R
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {(['7d', '30d', 'all'] as const).map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => setTimeframe(tf)}
              className={cn(
                'text-xs rounded-xs cursor-pointer touch-manipulation min-h-[30px] px-2.5 py-1 font-mono font-semibold uppercase transition-colors',
                timeframe === tf
                  ? 'bg-brand/15 text-brand border-brand/40 border font-bold'
                  : 'text-fg-subtle hover:text-fg bg-bg-elev-2 border border-transparent',
              )}
            >
              {tf.toUpperCase()}
            </button>
          ))}
        </div>
      </header>
      <div className="border-divider border-t pt-3">
        <PerformanceChart entries={[...filteredEntries]} height={200} />
      </div>
    </Card>
  );
}
