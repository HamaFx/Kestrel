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

// Selected-sweep detail: progress, best-parameter scorecard and the ranked
// results table.
import { IconRefresh, IconTrash } from '@tabler/icons-react';

import { fmtMoney, fmtPct, toneClass } from '../format';
import { SweepResultsTable } from './sweep-results-table';
import type { SweepPanelController } from './use-sweep-panel';

export function SweepDetail({ panel }: { panel: SweepPanelController }) {
  const selected = panel.selected;
  if (!selected) return null;

  return (
    <section className="surface-panel flex flex-col gap-3 rounded-xl border border-white/10 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-fg text-sm font-semibold">{selected.name}</h2>
          <p className="text-fg-subtle font-mono text-[10px]">
            {selected.symbol} · {selected.timeframe} · {selected.objective} · {selected.completed}/
            {selected.total}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {selected.status === 'queued' || selected.status === 'running' ? (
            <button
              type="button"
              onClick={() => void panel.cancelSweep(selected.id)}
              disabled={panel.busy}
              className="border-warn/30 text-warn inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-[11px] font-semibold"
            >
              Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void panel.deleteSweep(selected.id)}
              disabled={panel.busy}
              className="text-fg-subtle hover:text-danger inline-flex size-8 items-center justify-center rounded-md"
              aria-label="Delete sweep"
            >
              <IconTrash className="size-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => void panel.openSweep(selected.id)}
            className="text-fg-subtle hover:text-fg inline-flex size-8 items-center justify-center rounded-md"
            aria-label="Refresh sweep"
          >
            <IconRefresh className="size-3.5" />
          </button>
        </div>
      </header>

      {selected.status === 'queued' || selected.status === 'running' ? (
        <div className="flex flex-col gap-1">
          <div className="bg-bg-elev-3 h-1.5 w-full overflow-hidden rounded-full">
            <div
              className="bg-brand h-full rounded-full transition-all"
              style={{ width: `${panel.progress}%` }}
            />
          </div>
          <span className="text-fg-subtle text-[10px]">
            {selected.status === 'queued'
              ? 'Queued for the worker…'
              : `Running… ${panel.progress}%`}
          </span>
        </div>
      ) : null}

      {selected.error ? <p className="text-danger text-[11px]">{selected.error}</p> : null}

      {selected.bestMetrics ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label="Best score" value={selected.bestScore?.toFixed(3) ?? '—'} />
          <Metric label="Trades" value={String(selected.bestMetrics.trades)} />
          <Metric label="Win rate" value={fmtPct(selected.bestMetrics.winRate)} />
          <Metric
            label="Net P&L"
            value={fmtMoney(selected.bestMetrics.netPnl)}
            tone={selected.bestMetrics.netPnl}
          />
          <Metric label="Profit factor" value={selected.bestMetrics.profitFactor.toFixed(2)} />
          <Metric label="Expectancy R" value={selected.bestMetrics.expectancyR.toFixed(2)} />
          <Metric
            label="Max DD"
            value={fmtPct(selected.bestMetrics.maxDrawdownPct)}
            tone={-selected.bestMetrics.maxDrawdownPct}
          />
          <Metric label="Best params" value={JSON.stringify(selected.bestParams ?? {})} mono />
        </div>
      ) : null}

      {selected.results.length > 0 ? <SweepResultsTable results={selected.results} /> : null}
    </section>
  );
}

function Metric({
  label,
  value,
  tone,
  mono = false,
}: {
  label: string;
  value: string;
  tone?: number;
  mono?: boolean;
}) {
  return (
    <div className="border-border/50 bg-bg-elev-2/40 flex flex-col gap-0.5 rounded-md border p-2">
      <span className="text-fg-subtle text-[9px] font-semibold uppercase">{label}</span>
      <span
        className={`text-fg text-xs font-semibold ${mono ? 'font-mono' : 'tabular-nums'} ${
          tone === undefined ? '' : toneClass(tone)
        }`}
      >
        {value}
      </span>
    </div>
  );
}
