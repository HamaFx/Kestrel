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
import type { PluginPageProps } from '@kestrel/plugin-sdk/ui';
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconChartLine,
  IconCode,
  IconFlask,
  IconLoader2,
  IconTrash,
} from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import type { z } from 'zod';

import type { RunDetailSchema } from '../schemas';
import { errorMessage, pluginFetch } from './api';
import { EquityChart } from './equity-chart';
import { fmtDate, fmtMoney, fmtNumber, fmtPct, fmtR, toneClass } from './format';
import { MetricsGrid } from './metrics-grid';
import { TradeTable } from './trade-table';

type RunDetail = z.infer<typeof RunDetailSchema>;
type DetailTab = 'trades' | 'diagnostics' | 'source';

export function BacktestRunPage({ params }: PluginPageProps) {
  const runId = params['runId'] ?? '';
  const [run, setRun] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<DetailTab>('trades');
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!runId) {
      setError('Missing run id.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await pluginFetch<{ run: RunDetail }>(`/runs/${encodeURIComponent(runId)}`);
      setRun(response.run);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove() {
    if (!window.confirm('Delete this backtest run?')) return;
    setDeleting(true);
    try {
      await pluginFetch(`/runs/${encodeURIComponent(runId)}`, { method: 'DELETE' });
      window.location.assign('/plugins/backtesting');
    } catch (err) {
      setError(errorMessage(err));
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="surface-panel flex items-center gap-2 rounded-xl border border-white/10 p-6 text-sm">
        <IconLoader2 className="text-brand size-4 animate-spin" />
        <span className="text-fg-muted">Loading backtest run…</span>
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="flex flex-col gap-3">
        <a
          href="/plugins/backtesting"
          className="text-fg-subtle hover:text-fg inline-flex items-center gap-1.5 text-xs font-semibold"
        >
          <IconArrowLeft className="size-3.5" />
          Backtesting Lab
        </a>
        <div className="border-danger/30 bg-danger/5 text-danger flex items-start gap-2 rounded-lg border p-3 text-xs">
          <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{error ?? 'Run not found.'}</span>
        </div>
      </div>
    );
  }

  const positive = run.metrics.netPnl >= 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <a
            href="/plugins/backtesting"
            className="text-fg-subtle hover:text-fg mt-1 inline-flex size-7 items-center justify-center rounded-md"
            aria-label="Back to Backtesting Lab"
          >
            <IconArrowLeft className="size-4" />
          </a>
          <div className="flex flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-fg text-lg font-semibold tracking-tight">{run.name}</h2>
              <span className="bg-bg-elev-2 text-fg-subtle rounded px-2 py-0.5 font-mono text-[10px] uppercase">
                {run.symbol} · {run.timeframe}
              </span>
              {run.truncated ? (
                <span className="bg-warn/10 text-warn rounded px-2 py-0.5 font-mono text-[10px] uppercase">
                  preview
                </span>
              ) : null}
            </div>
            <p className="text-fg-subtle font-mono text-[11px]">
              {run.bars} bars · {fmtDate(run.from)} → {fmtDate(run.to)} · {run.trades.length} trades
              · {run.engineVersion}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <p
              className={`font-mono text-lg font-bold tabular-nums ${toneClass(run.metrics.netPnl)}`}
            >
              {fmtMoney(run.metrics.netPnl)}
            </p>
            <p className={`font-mono text-[11px] ${toneClass(run.metrics.returnPct)}`}>
              {fmtPct(run.metrics.returnPct)} · {fmtNumber(run.metrics.expectancyR, 2)}R avg
            </p>
          </div>
          <button
            type="button"
            onClick={() => void remove()}
            disabled={deleting}
            className="text-fg-subtle hover:text-danger border-border/60 inline-flex size-9 items-center justify-center rounded-md border transition-colors disabled:opacity-50"
            aria-label="Delete run"
          >
            {deleting ? (
              <IconLoader2 className="size-4 animate-spin" />
            ) : (
              <IconTrash className="size-4" />
            )}
          </button>
        </div>
      </div>

      <MetricsGrid metrics={run.metrics} />

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

      <div className="border-border/60 flex items-center gap-1 border-b pb-1">
        {(
          [
            ['trades', `Trades (${run.trades.length})`],
            ['diagnostics', `Diagnostics (${run.rejectedSignals.length})`],
            ['source', 'Strategy source'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={
              tab === id
                ? 'bg-bg-elev-2 text-fg border-brand/40 rounded-md border px-3 py-1.5 text-xs font-semibold'
                : 'text-fg-subtle hover:text-fg rounded-md border border-transparent px-3 py-1.5 text-xs font-semibold'
            }
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'trades' ? <TradeTable trades={run.trades} limit={500} showDates /> : null}

      {tab === 'diagnostics' ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <section className="surface-panel flex flex-col gap-2 rounded-xl border border-white/10 p-4">
            <h3 className="text-fg-subtle text-[10px] font-semibold tracking-wider uppercase">
              Rejected signals
            </h3>
            {run.rejectedSignals.length === 0 ? (
              <p className="text-fg-subtle text-xs">None.</p>
            ) : (
              <ul className="divide-border/40 flex max-h-72 flex-col divide-y overflow-auto">
                {run.rejectedSignals.map((rejection, index) => (
                  <li
                    key={`${rejection.signalTime}-${index}`}
                    className="flex flex-col gap-0.5 py-1.5"
                  >
                    <span className="text-fg-muted text-xs">{rejection.reason}</span>
                    <span className="text-fg-subtle font-mono text-[10px]">
                      bar {rejection.signalIndex} · {fmtDate(rejection.signalTime)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="surface-panel flex flex-col gap-2 rounded-xl border border-white/10 p-4">
            <h3 className="text-fg-subtle text-[10px] font-semibold tracking-wider uppercase">
              Strategy logs
            </h3>
            {run.logs.length === 0 ? (
              <p className="text-fg-subtle text-xs">The strategy did not log anything.</p>
            ) : (
              <pre className="border-border/40 bg-bg-elev-1/50 text-fg-muted max-h-72 overflow-auto rounded-md border p-2 font-mono text-[10px] whitespace-pre-wrap">
                {run.logs.join('\n')}
              </pre>
            )}
          </section>
        </div>
      ) : null}

      {tab === 'source' ? (
        <section className="surface-panel flex flex-col gap-2 rounded-xl border border-white/10 p-4">
          <div className="flex items-center gap-2">
            <IconCode className="text-fg-subtle size-3.5" />
            <h3 className="text-fg-subtle text-[10px] font-semibold tracking-wider uppercase">
              Exact source
            </h3>
            <span className="text-fg-subtle ml-auto font-mono text-[10px]">
              params {JSON.stringify(run.params)}
            </span>
          </div>
          <pre className="border-border/40 bg-bg-elev-1/50 text-fg-muted max-h-[520px] overflow-auto rounded-md border p-3 font-mono text-[11px] leading-relaxed">
            {run.source}
          </pre>
        </section>
      ) : null}
    </div>
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
