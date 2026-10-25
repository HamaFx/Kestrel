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
import { IconArrowUpRight, IconLoader2, IconTrash } from '@tabler/icons-react';
import type { z } from 'zod';

import type { RunSummarySchema } from '../schemas';
import { fmtDate, fmtMoney, fmtNumber, fmtPct, toneClass } from './format';

type RunSummary = z.infer<typeof RunSummarySchema>;

export function RunsList({
  runs,
  busyId,
  onDelete,
}: {
  runs: readonly RunSummary[];
  busyId: string | null;
  onDelete: (runId: string) => void;
}) {
  if (runs.length === 0) {
    return (
      <div className="border-border/50 text-fg-subtle rounded-xl border border-dashed p-8 text-center text-xs">
        No backtests yet. Run a strategy from the chat or the New run tab.
      </div>
    );
  }

  return (
    <div className="border-border/50 overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[720px] text-left text-xs">
        <thead className="bg-bg-elev-2/60 text-fg-subtle font-mono text-[10px] uppercase">
          <tr>
            <th className="px-3 py-2 font-semibold">Run</th>
            <th className="px-3 py-2 font-semibold">Market</th>
            <th className="px-3 py-2 text-right font-semibold">Trades</th>
            <th className="px-3 py-2 text-right font-semibold">Win</th>
            <th className="px-3 py-2 text-right font-semibold">PF</th>
            <th className="px-3 py-2 text-right font-semibold">Net</th>
            <th className="px-3 py-2 text-right font-semibold">Return</th>
            <th className="px-3 py-2 text-right font-semibold">DD</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-border/40 divide-y">
          {runs.map((run) => (
            <tr key={run.id} className="hover:bg-bg-elev-1/40">
              <td className="px-3 py-2">
                <a
                  href={`/plugins/backtesting/runs/${encodeURIComponent(run.id)}`}
                  className="text-fg flex items-center gap-1 font-semibold hover:underline"
                >
                  {run.name}
                  <IconArrowUpRight className="text-fg-subtle size-3" />
                </a>
                <span className="text-fg-subtle font-mono text-[10px]">
                  {fmtDate(run.createdAt)}
                </span>
              </td>
              <td className="text-fg-muted px-3 py-2 font-mono text-[11px]">
                {run.symbol} · {run.timeframe}
              </td>
              <td className="text-fg px-3 py-2 text-right font-mono tabular-nums">
                {run.metrics.trades}
              </td>
              <td className="text-fg px-3 py-2 text-right font-mono tabular-nums">
                {fmtNumber(run.metrics.winRate, 1)}%
              </td>
              <td className="text-fg px-3 py-2 text-right font-mono tabular-nums">
                {fmtNumber(run.metrics.profitFactor, 2)}
              </td>
              <td
                className={`px-3 py-2 text-right font-mono font-semibold tabular-nums ${toneClass(
                  run.metrics.netPnl,
                )}`}
              >
                {fmtMoney(run.metrics.netPnl)}
              </td>
              <td
                className={`px-3 py-2 text-right font-mono tabular-nums ${toneClass(
                  run.metrics.returnPct,
                )}`}
              >
                {fmtPct(run.metrics.returnPct, 1)}
              </td>
              <td className="text-fg-muted px-3 py-2 text-right font-mono tabular-nums">
                {fmtNumber(run.metrics.maxDrawdownPct, 1)}%
              </td>
              <td className="px-3 py-2 text-right">
                <button
                  type="button"
                  onClick={() => onDelete(run.id)}
                  disabled={busyId !== null}
                  aria-label={`Delete ${run.name}`}
                  className="text-fg-subtle hover:text-danger inline-flex size-7 items-center justify-center rounded-md transition-colors disabled:opacity-40"
                >
                  {busyId === run.id ? (
                    <IconLoader2 className="size-3.5 animate-spin" />
                  ) : (
                    <IconTrash className="size-3.5" />
                  )}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
