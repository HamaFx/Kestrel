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
import {
  IconAlertTriangle,
  IconArrowUpRight,
  IconChartLine,
  IconFlask,
  IconLoader2,
} from '@tabler/icons-react';

import { RunResultSchema } from '../schemas';
import { DeployToPaperButton } from './deploy-to-paper-button';
import { EquityChart } from './equity-chart';
import { fmtMoney, toneClass } from './format';
import { MetricsGrid } from './metrics-grid';
import { TradeTable } from './trade-table';

/**
 * Rich chat renderer for `backtest_run_strategy` (and `backtest_get_run`).
 *
 * The full dataset streams to this card; the LLM only receives the compact
 * scorecard via the tool's `toModelOutput`.
 */
export function BacktestResultCard({ output, state, errorMessage }: PluginToolPartProps) {
  if (state === 'loading') {
    return (
      <div className="surface-panel flex items-center gap-3 rounded-xl border border-white/10 p-4">
        <IconLoader2 className="text-brand size-4 animate-spin" />
        <div className="flex flex-col">
          <span className="text-fg text-sm font-semibold">Running backtest…</span>
          <span className="text-fg-subtle text-[11px]">
            Fetching candles, computing features and simulating bar-by-bar.
          </span>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="border-danger/30 bg-danger/5 flex items-start gap-2 rounded-xl border p-4">
        <IconAlertTriangle className="text-danger mt-0.5 size-4 shrink-0" />
        <div className="flex flex-col gap-0.5">
          <span className="text-danger text-sm font-semibold">Backtest failed</span>
          <span className="text-fg-muted text-xs">{errorMessage ?? 'Unknown error'}</span>
        </div>
      </div>
    );
  }

  const parsed = RunResultSchema.safeParse(output);
  if (!parsed.success) {
    return (
      <div className="border-warn/30 bg-warn/5 flex items-start gap-2 rounded-xl border p-4">
        <IconAlertTriangle className="text-warn mt-0.5 size-4 shrink-0" />
        <span className="text-fg-muted text-xs">
          The backtest result did not match the expected shape.
        </span>
      </div>
    );
  }

  const run = parsed.data;
  const positive = run.metrics.netPnl >= 0;
  const href = `/plugins/backtesting/runs/${encodeURIComponent(run.runId)}`;

  return (
    <section className="surface-panel flex flex-col gap-3 rounded-xl border border-white/10 p-4 shadow-[var(--shadow-chip)]">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <span className="bg-brand/10 text-brand flex size-9 items-center justify-center rounded-md">
            <IconFlask className="size-4" />
          </span>
          <div className="flex flex-col gap-0.5">
            <h3 className="text-fg text-sm font-semibold">{run.name}</h3>
            <p className="text-fg-subtle font-mono text-[11px]">
              {run.symbol} · {run.timeframe} · {run.bars} bars
              {run.truncated ? ' · preview' : ''}
            </p>
          </div>
        </div>
        <span
          className={`font-mono text-sm font-bold tabular-nums ${toneClass(run.metrics.netPnl)}`}
        >
          {fmtMoney(run.metrics.netPnl)}
        </span>
      </header>

      <div className={positive ? 'text-bull' : 'text-bear'}>
        <EquityChart
          points={run.equityCurve}
          baseline={run.initialBalance}
          height={150}
          label={`${run.symbol} equity curve`}
        />
      </div>

      <MetricsGrid metrics={run.metrics} />

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <IconChartLine className="text-fg-subtle size-3.5" />
          <span className="text-fg-subtle text-[10px] font-semibold tracking-wider uppercase">
            Recent trades
          </span>
        </div>
        <TradeTable trades={run.trades} limit={6} />
      </div>

      {run.warnings.length > 0 ? (
        <ul className="text-warn flex flex-col gap-1 text-[11px]">
          {run.warnings.slice(0, 4).map((warning) => (
            <li key={warning} className="flex items-start gap-1.5">
              <IconAlertTriangle className="mt-0.5 size-3 shrink-0" />
              <span>{warning}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <footer className="flex items-center justify-between gap-2">
        <span className="text-fg-subtle font-mono text-[10px]">
          {run.metrics.trades} trades · PF {run.metrics.profitFactor.toFixed(2)} · maxDD{' '}
          {run.metrics.maxDrawdownPct.toFixed(1)}%
        </span>
        <div className="flex items-center gap-2">
          {run.status === 'completed' ? <DeployToPaperButton runId={run.runId} compact /> : null}
          <a
            href={href}
            className="text-brand inline-flex items-center gap-1 text-xs font-semibold hover:underline"
          >
            Open full run
            <IconArrowUpRight className="size-3.5" />
          </a>
        </div>
      </footer>
    </section>
  );
}
