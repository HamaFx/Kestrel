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

// Phase 1.8 — P&L calendar heatmap.
//
// TradeZella-style grid of daily realized R. Each closed day is coloured
// green/red by the sum of `rMultiple` for trades that closed on that local
// day; opacity scales with magnitude. Days with no closed trades are
// `bg-bg-elev-2`. Clicking a day opens a Drawer listing the trades that
// closed that day (reuse the journal EntryList pattern, but filtered).
//
// Pure client component — receives entries as props (the dashboard page
// already does the `Promise.all` fetch).
import type { JournalEntry } from '@kestrel/shared';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';

import { Card } from '@/components/ui/card';

import { DayTradesDrawer } from './day-trades-drawer';
import { HeatmapMonth } from './heatmap-month';
import { useHeatmapData } from './use-heatmap-data';

interface PnLHeatmapWidgetProps {
  entries: readonly JournalEntry[];
}

export function PnLHeatmapWidget({ entries }: PnLHeatmapWidgetProps) {
  const { months, totals, selectedDay, setSelectedDay, shiftMonth } = useHeatmapData(entries);

  return (
    <Card
      as="section"
      aria-label={`P&L heatmap. ${totals.count} trades, total ${totals.r >= 0 ? '+' : ''}${totals.r.toFixed(1)}R`}
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-fg text-body-sm font-semibold">P&L Heatmap</span>
          <span className="text-fg-subtle text-caption tabular-nums">
            {totals.count} trades · {totals.r >= 0 ? '+' : ''}
            {totals.r.toFixed(1)}R
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
            className="text-fg-subtle hover:text-fg hover:bg-bg-elev-2 tactile-press inline-flex size-10 min-h-10 min-w-10 items-center justify-center rounded-md transition-colors"
          >
            <IconChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            aria-label="Next month"
            className="text-fg-subtle hover:text-fg hover:bg-bg-elev-2 tactile-press inline-flex size-10 min-h-10 min-w-10 items-center justify-center rounded-md transition-colors"
          >
            <IconChevronRight className="size-4" />
          </button>
        </div>
      </header>

      {months.map((m, mi) => (
        <HeatmapMonth key={mi} month={m} onSelectDay={setSelectedDay} />
      ))}

      <Legend />

      {/* Trade list drawer for the selected day */}
      <DayTradesDrawer selectedDay={selectedDay} onClose={() => setSelectedDay(null)} />
    </Card>
  );
}

function Legend() {
  return (
    <div className="text-fg-subtle text-caption flex items-center gap-2">
      <span>Loss</span>
      <div className="flex items-center gap-1">
        {[0.85, 0.6, 0.4, 0.2].map((a) => (
          <span
            key={`bear-${a}`}
            className="size-3 rounded-[3px]"
            style={{
              backgroundColor: 'var(--color-bear)',
              opacity: a,
            }}
            aria-hidden="true"
          />
        ))}
        <span
          className="bg-bg-elev-2 border-border/60 size-3 rounded-[3px] border"
          aria-hidden="true"
        />
        {[0.2, 0.4, 0.6, 0.85].map((a) => (
          <span
            key={`bull-${a}`}
            className="size-3 rounded-[3px]"
            style={{
              backgroundColor: 'var(--color-bull)',
              opacity: a,
            }}
            aria-hidden="true"
          />
        ))}
      </div>
      <span>Gain</span>
    </div>
  );
}
