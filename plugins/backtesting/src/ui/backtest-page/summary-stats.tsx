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
import { fmtMoney, fmtPct, PLUGIN_UI_CLASSES, toneClass } from '../format';
import type { BacktestPageController } from './use-backtest-page';

export function SummaryStats({ page }: { page: BacktestPageController }) {
  return (
    <section role="group" data-slot="kpi-group" className={PLUGIN_UI_CLASSES.kpiGroup}>
      <Stat label="Saved runs" value={String(page.summary?.runCount ?? page.runs.length)} />
      <Stat
        label="Strategies"
        value={String(page.summary?.strategyCount ?? page.strategies.length)}
      />
      <Stat
        label="Knowledge docs"
        value={String(page.summary?.knowledgeCount ?? page.documents.length)}
      />
      <div data-slot="kpi" className={PLUGIN_UI_CLASSES.kpiCell}>
        <span data-slot="kpi-label" className={PLUGIN_UI_CLASSES.kpiLabel}>
          Latest run
        </span>
        {page.summary?.latestRun ? (
          <>
            <span
              data-slot="kpi-value"
              className={`${PLUGIN_UI_CLASSES.kpiValue} ${toneClass(page.summary.latestRun.metrics.netPnl)}`}
            >
              {fmtMoney(page.summary.latestRun.metrics.netPnl)}
            </span>
            <span data-slot="kpi-footer" className={PLUGIN_UI_CLASSES.kpiHint}>
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
    <div data-slot="kpi" className={PLUGIN_UI_CLASSES.kpiCell}>
      <span data-slot="kpi-label" className={PLUGIN_UI_CLASSES.kpiLabel}>
        {label}
      </span>
      <span data-slot="kpi-value" className={`${PLUGIN_UI_CLASSES.kpiValue} text-fg`}>
        {value}
      </span>
    </div>
  );
}
