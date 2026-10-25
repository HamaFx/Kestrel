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

// Summary statistics header for the Backtesting Lab page.
import { fmtMoney, fmtPct, toneClass } from '../format';
import type { BacktestPageController } from './use-backtest-page';

export function SummaryStats({ page }: { page: BacktestPageController }) {
  return (
    <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat label="Saved runs" value={String(page.summary?.runCount ?? page.runs.length)} />
      <Stat
        label="Strategies"
        value={String(page.summary?.strategyCount ?? page.strategies.length)}
      />
      <Stat
        label="Knowledge docs"
        value={String(page.summary?.knowledgeCount ?? page.documents.length)}
      />
      <div className="surface-panel flex flex-col gap-0.5 rounded-xl border border-white/10 p-3">
        <span className="text-fg-subtle text-[10px] font-semibold tracking-wider uppercase">
          Latest run
        </span>
        {page.summary?.latestRun ? (
          <>
            <span
              className={`font-mono text-sm font-semibold ${toneClass(page.summary.latestRun.metrics.netPnl)}`}
            >
              {fmtMoney(page.summary.latestRun.metrics.netPnl)}
            </span>
            <span className="text-fg-subtle font-mono text-[10px]">
              {page.summary.latestRun.symbol} ·{' '}
              {fmtPct(page.summary.latestRun.metrics.returnPct, 1)}
            </span>
          </>
        ) : (
          <span className="text-fg-subtle text-xs">No runs yet</span>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-panel flex flex-col gap-0.5 rounded-xl border border-white/10 p-3">
      <span className="text-fg-subtle text-[10px] font-semibold tracking-wider uppercase">
        {label}
      </span>
      <span className="text-fg font-mono text-lg font-semibold tabular-nums">{value}</span>
    </div>
  );
}
