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
import type { PluginToolPartProps } from '@kestrel/plugin-sdk/ui';
import { IconArrowUpRight, IconFlask, IconLoader2 } from '@tabler/icons-react';

import { ListRunsOutputSchema } from '../schemas';
import { fmtDate, fmtMoney, fmtNumber, fmtPct, toneClass } from './format';

/** Chat card for `backtest_list_runs`. */
export function BacktestRunsCard({ output, state, errorMessage }: PluginToolPartProps) {
  if (state === 'loading') {
    return (
      <div className="surface-panel flex items-center gap-2 rounded-xl border border-white/10 p-3 text-xs">
        <IconLoader2 className="text-brand size-3.5 animate-spin" />
        <span className="text-fg-muted">Loading recent backtests…</span>
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div className="border-danger/30 bg-danger/5 text-danger rounded-xl border p-3 text-xs">
        {errorMessage ?? 'Could not load backtest runs.'}
      </div>
    );
  }

  const parsed = ListRunsOutputSchema.safeParse(output);
  if (!parsed.success) {
    return (
      <div className="border-warn/30 bg-warn/5 text-warn rounded-xl border p-3 text-xs">
        Unexpected backtest list shape.
      </div>
    );
  }

  const runs = parsed.data.runs;
  return (
    <section className="surface-panel flex flex-col gap-2 rounded-xl border border-white/10 p-3">
      <header className="flex items-center gap-2">
        <IconFlask className="text-brand size-4" />
        <h3 className="text-fg text-sm font-semibold">Recent backtests</h3>
        <span className="text-fg-subtle font-mono text-[10px]">{runs.length} runs</span>
      </header>

      {runs.length === 0 ? (
        <p className="text-fg-subtle text-xs">
          No runs yet. Ask for a strategy backtest to create the first one.
        </p>
      ) : (
        <ul className="divide-border/40 flex flex-col divide-y">
          {runs.map((run) => (
            <li key={run.id}>
              <a
                href={`/plugins/backtesting/runs/${encodeURIComponent(run.id)}`}
                className="hover:bg-bg-elev-1/50 -mx-1 flex items-center justify-between gap-3 rounded-md px-1 py-2"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="text-fg truncate text-xs font-semibold">{run.name}</span>
                  <span className="text-fg-subtle font-mono text-[10px]">
                    {run.symbol} · {run.timeframe} · {fmtDate(run.createdAt)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p
                      className={`font-mono text-xs font-semibold ${toneClass(run.metrics.netPnl)}`}
                    >
                      {fmtMoney(run.metrics.netPnl)}
                    </p>
                    <p className="text-fg-subtle font-mono text-[10px]">
                      {fmtPct(run.metrics.returnPct, 1)} · DD{' '}
                      {fmtNumber(run.metrics.maxDrawdownPct, 1)}%
                    </p>
                  </div>
                  <IconArrowUpRight className="text-fg-subtle size-3.5" />
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
