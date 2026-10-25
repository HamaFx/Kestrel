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

// Equity curve, trade distribution and warning list for a saved run.
import { IconAlertTriangle, IconChartLine, IconFlask } from '@tabler/icons-react';
import type { z } from 'zod';

import type { RunDetailSchema } from '../../schemas';
import { EquityChart } from '../equity-chart';
import { fmtMoney, fmtNumber, fmtR } from '../format';

type RunDetail = z.infer<typeof RunDetailSchema>;

export function EquitySection({ run }: { run: RunDetail }) {
  const positive = run.metrics.netPnl >= 0;

  return (
    <>
      <section className="grid grid-cols-1 gap-3 lg:grid-cols-[1.6fr_1fr]">
        <div className="surface-panel flex flex-col gap-2 rounded-xl border border-white/10 p-4">
          <div className="flex items-center gap-2">
            <IconChartLine className="text-fg-subtle size-3.5" />
            <h3 className="text-fg-subtle text-[10px] font-semibold tracking-wider uppercase">
              Equity curve
            </h3>
            <span className="text-fg-subtle ml-auto font-mono text-[10px]">
              start {fmtMoney(run.initialBalance)}
            </span>
          </div>
          <div className={positive ? 'text-bull' : 'text-bear'}>
            <EquityChart
              points={run.equityCurve}
              baseline={run.initialBalance}
              height={200}
              label={`${run.symbol} equity curve`}
            />
          </div>
        </div>

        <div className="surface-panel flex flex-col gap-2 rounded-xl border border-white/10 p-4">
          <div className="flex items-center gap-2">
            <IconFlask className="text-fg-subtle size-3.5" />
            <h3 className="text-fg-subtle text-[10px] font-semibold tracking-wider uppercase">
              Trade distribution
            </h3>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-[11px]">
            <Row label="Average win" value={fmtR(run.metrics.averageWinR)} tone="text-bull" />
            <Row label="Average loss" value={fmtR(run.metrics.averageLossR)} tone="text-bear" />
            <Row label="Largest win" value={fmtMoney(run.metrics.largestWin)} tone="text-bull" />
            <Row label="Largest loss" value={fmtMoney(run.metrics.largestLoss)} tone="text-bear" />
            <Row label="Long win rate" value={`${fmtNumber(run.metrics.longWinRate, 1)}%`} />
            <Row label="Short win rate" value={`${fmtNumber(run.metrics.shortWinRate, 1)}%`} />
            <Row label="Max win streak" value={String(run.metrics.consecutiveWins)} />
            <Row label="Max loss streak" value={String(run.metrics.consecutiveLosses)} />
            <Row label="Fees paid" value={fmtMoney(-Math.abs(run.metrics.feesPaid))} />
            <Row
              label="Best / worst R"
              value={`${fmtR(run.metrics.bestTradeR)} / ${fmtR(run.metrics.worstTradeR)}`}
            />
          </dl>
        </div>
      </section>

      {run.warnings.length > 0 ? (
        <ul className="border-warn/30 bg-warn/5 text-warn flex flex-col gap-1 rounded-lg border p-3 text-[11px]">
          {run.warnings.map((warning) => (
            <li key={warning} className="flex items-start gap-1.5">
              <IconAlertTriangle className="mt-0.5 size-3 shrink-0" />
              <span>{warning}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-bg-elev-1/60 border-border/40 flex flex-col gap-0.5 rounded-md border p-2">
      <dt className="text-fg-subtle text-[10px] font-semibold tracking-wider uppercase">{label}</dt>
      <dd className={`font-mono text-xs font-semibold tabular-nums ${tone ?? 'text-fg'}`}>
        {value}
      </dd>
    </div>
  );
}
