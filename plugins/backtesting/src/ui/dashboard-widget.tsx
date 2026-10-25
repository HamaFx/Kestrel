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
import type { PluginDashboardWidgetProps } from '@kestrel/plugin-sdk/ui';
import { IconArrowUpRight, IconFlask, IconLoader2 } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import { pluginFetch } from './api';
import { fmtMoney, fmtNumber, fmtPct, toneClass } from './format';

interface SummaryResponse {
  runCount: number;
  strategyCount: number;
  latestRun: {
    name: string;
    symbol: string;
    timeframe: string;
    metrics: {
      trades: number;
      winRate: number;
      netPnl: number;
      returnPct: number;
      maxDrawdownPct: number;
      profitFactor: number;
    };
  } | null;
}

export function BacktestingWidget(_props: PluginDashboardWidgetProps) {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    pluginFetch<SummaryResponse>('/summary')
      .then((response) => {
        if (!cancelled) setSummary(response);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="surface-panel flex h-full flex-col gap-3 rounded-xl border border-white/10 p-4 shadow-[var(--shadow-chip)]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-brand/10 text-brand flex size-8 items-center justify-center rounded-md">
            <IconFlask className="size-4" />
          </span>
          <div className="flex flex-col">
            <span className="text-fg text-sm font-semibold">Backtesting Lab</span>
            <span className="text-fg-subtle text-[11px]">
              {summary
                ? `${summary.runCount} runs · ${summary.strategyCount} strategies`
                : 'Loading research state…'}
            </span>
          </div>
        </div>
        {!summary && !error ? <IconLoader2 className="text-fg-subtle size-4 animate-spin" /> : null}
      </div>

      {error ? (
        <p className="text-fg-subtle text-xs">Could not load the latest run.</p>
      ) : summary?.latestRun ? (
        <dl className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="bg-bg-elev-1/50 col-span-2 flex flex-col rounded-md p-2">
            <dt className="text-fg-subtle truncate">{summary.latestRun.name}</dt>
            <dd className="flex items-baseline justify-between gap-2">
              <span className="text-fg-subtle font-mono text-[10px]">
                {summary.latestRun.symbol} · {summary.latestRun.timeframe}
              </span>
              <span
                className={`font-mono text-sm font-semibold ${toneClass(
                  summary.latestRun.metrics.netPnl,
                )}`}
              >
                {fmtMoney(summary.latestRun.metrics.netPnl)}
              </span>
            </dd>
          </div>
          <div className="bg-bg-elev-1/50 rounded-md p-2">
            <dt className="text-fg-subtle">Win rate</dt>
            <dd className="text-fg font-mono font-semibold">
              {fmtNumber(summary.latestRun.metrics.winRate, 1)}%
            </dd>
          </div>
          <div className="bg-bg-elev-1/50 rounded-md p-2">
            <dt className="text-fg-subtle">Max DD</dt>
            <dd className="text-fg font-mono font-semibold">
              {fmtNumber(summary.latestRun.metrics.maxDrawdownPct, 1)}%
            </dd>
          </div>
          <div className="bg-bg-elev-1/50 rounded-md p-2">
            <dt className="text-fg-subtle">Return</dt>
            <dd
              className={`font-mono font-semibold ${toneClass(summary.latestRun.metrics.returnPct)}`}
            >
              {fmtPct(summary.latestRun.metrics.returnPct, 1)}
            </dd>
          </div>
          <div className="bg-bg-elev-1/50 rounded-md p-2">
            <dt className="text-fg-subtle">Profit factor</dt>
            <dd className="text-fg font-mono font-semibold">
              {fmtNumber(summary.latestRun.metrics.profitFactor, 2)}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="text-fg-subtle text-xs">
          No backtests yet. Ask Kestrel to test a strategy and the scorecard will appear here.
        </p>
      )}

      <a
        href="/plugins/backtesting"
        className="text-brand mt-auto inline-flex items-center gap-1.5 text-xs font-semibold hover:underline"
      >
        Open Backtesting Lab
        <IconArrowUpRight className="size-3.5" />
      </a>
    </div>
  );
}
