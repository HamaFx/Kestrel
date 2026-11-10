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
import type { z } from 'zod';

import type { BacktestMetricsSchema } from '../schemas';
import {
  fmtMoney,
  fmtNumber,
  fmtPct,
  fmtR,
  PLUGIN_UI_CLASSES,
  toneClass,
  trendToneClass,
} from './format';

type Metrics = z.infer<typeof BacktestMetricsSchema>;

function Cell({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: string;
  hint?: string;
}) {
  return (
    <div data-slot="kpi" className={PLUGIN_UI_CLASSES.kpiCell}>
      <span data-slot="kpi-label" className={PLUGIN_UI_CLASSES.kpiLabel}>
        {label}
      </span>
      <span
        data-slot="kpi-value"
        className={`${PLUGIN_UI_CLASSES.kpiValue} ${tone ?? 'text-fg'}`}
      >
        {value}
      </span>
      {hint ? (
        <span data-slot="kpi-footer" className={PLUGIN_UI_CLASSES.kpiHint}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/** Compact shared-hairline KPI scorecard used by the chat card and the run page. */
export function MetricsGrid({ metrics }: { metrics: Metrics }) {
  const cells = [
    {
      label: 'Trades',
      value: String(metrics.trades),
      hint: `${metrics.longTrades}L / ${metrics.shortTrades}S`,
    },
    {
      label: 'Win rate',
      value: `${fmtNumber(metrics.winRate, 1)}%`,
      tone: metrics.winRate >= 50 ? 'text-bull' : 'text-fg',
    },
    {
      label: 'Profit factor',
      value: fmtNumber(metrics.profitFactor, 2),
      tone:
        metrics.profitFactor >= 1.3
          ? 'text-bull'
          : metrics.profitFactor < 1
            ? 'text-bear'
            : 'text-fg',
    },
    {
      label: 'Net P&L',
      value: fmtMoney(metrics.netPnl),
      tone: toneClass(metrics.netPnl),
      hint: fmtPct(metrics.returnPct),
    },
    {
      label: 'Expectancy',
      value: fmtR(metrics.expectancyR),
      tone: toneClass(metrics.expectancyR),
      hint: fmtMoney(metrics.expectancy),
    },
    {
      label: 'Max drawdown',
      value: `${fmtNumber(metrics.maxDrawdownPct, 1)}%`,
      tone: trendToneClass(metrics.maxDrawdownPct - 20, 'down'),
      hint: fmtMoney(-Math.abs(metrics.maxDrawdown)),
    },
    {
      label: 'Sharpe (ann.)',
      value: fmtNumber(metrics.sharpeRatio, 2),
      hint: `Sortino ${fmtNumber(metrics.sortinoRatio, 2)} · SQN ${fmtNumber(metrics.sqn, 2)}`,
    },
    {
      label: 'Avg hold',
      value: `${fmtNumber(metrics.averageBarsHeld, 1)} bars`,
      hint: `Exposure ${fmtNumber(metrics.exposurePct, 1)}%`,
    },
  ];

  return (
    <div role="group" data-slot="kpi-group" className={PLUGIN_UI_CLASSES.kpiGroup}>
      {cells.map((cell) => (
        <Cell key={cell.label} {...cell} />
      ))}
    </div>
  );
}
