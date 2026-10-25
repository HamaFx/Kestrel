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
import {
  IconAlertTriangle,
  IconFlask,
  IconLoader2,
  IconPlus,
  IconRefresh,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import type { z } from 'zod';

import type { StrategySummarySchema, SweepDetailSchema, SweepSummarySchema } from '../schemas';
import { errorMessage, pluginFetch } from './api';
import { fmtMoney, fmtPct, toneClass } from './format';

type SweepSummary = z.infer<typeof SweepSummarySchema>;
type SweepDetail = z.infer<typeof SweepDetailSchema>;
type StrategySummary = z.infer<typeof StrategySummarySchema>;

interface ParamRow {
  name: string;
  values: string;
}

const inputClass =
  'border-border/60 bg-bg-elev-1 text-fg placeholder:text-fg-subtle focus:border-brand/60 h-9 w-full rounded-md border px-2.5 text-xs outline-none';

const OBJECTIVES = [
  { value: 'expectancyR', label: 'Expectancy (R)' },
  { value: 'profitFactor', label: 'Profit factor' },
  { value: 'sharpeRatio', label: 'Sharpe ratio' },
  { value: 'returnPct', label: 'Return %' },
  { value: 'netPnl', label: 'Net P&L' },
  { value: 'maxDrawdownPct', label: 'Lowest max drawdown' },
] as const;

const TIMEFRAMES = ['15m', '1h', '4h', '1d'] as const;

export function SweepPanel({ strategies }: { strategies: readonly StrategySummary[] }) {
  const [sweeps, setSweeps] = useState<SweepSummary[]>([]);
  const [selected, setSelected] = useState<SweepDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [strategyId, setStrategyId] = useState(strategies[0]?.id ?? '');
  const [symbol, setSymbol] = useState('XAUUSD');
  const [timeframe, setTimeframe] = useState<(typeof TIMEFRAMES)[number]>('1h');
  const [objective, setObjective] = useState<(typeof OBJECTIVES)[number]['value']>('expectancyR');
  const [maxCombinations, setMaxCombinations] = useState(30);
  const [minTrades, setMinTrades] = useState(5);
  const [params, setParams] = useState<ParamRow[]>([{ name: '', values: '' }]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await pluginFetch<{ sweeps: SweepSummary[] }>('/sweeps?limit=20');
      setSweeps(data.sweeps);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!strategyId && strategies[0]?.id) setStrategyId(strategies[0].id);
  }, [strategies, strategyId]);

  useEffect(() => {
    if (!selected || (selected.status !== 'queued' && selected.status !== 'running')) return;
    let cancelled = false;
    const timer = setInterval(() => {
      pluginFetch<{ sweep: SweepDetail }>(`/sweeps/${encodeURIComponent(selected.id)}`)
        .then((data) => {
          if (cancelled) return;
          setSelected(data.sweep);
          if (data.sweep.status !== 'queued' && data.sweep.status !== 'running') {
            void load();
          }
        })
        .catch(() => undefined);
    }, 2_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [selected, load]);

  async function openSweep(sweepId: string) {
    setError(null);
    try {
      const data = await pluginFetch<{ sweep: SweepDetail }>(
        `/sweeps/${encodeURIComponent(sweepId)}`,
      );
      setSelected(data.sweep);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function startSweep() {
    setError(null);
    setBusy(true);
    try {
      const parameterSpace = params
        .map((row) => ({
          name: row.name.trim(),
          values: row.values
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean)
            .map((value) => (Number.isFinite(Number(value)) ? Number(value) : value)),
        }))
        .filter((row) => row.name && row.values.length > 0);
      if (!strategyId) throw new Error('Pick a saved strategy first.');
      if (parameterSpace.length === 0) {
        throw new Error('Add at least one parameter with one or more comma-separated values.');
      }
      const data = await pluginFetch<{ sweep: SweepDetail; jobId: string | null; message: string }>(
        '/sweeps',
        {
          method: 'POST',
          body: JSON.stringify({
            strategyId,
            symbol,
            timeframe,
            parameterSpace,
            objective,
            maxCombinations,
            minTrades,
            count: 1000,
            initialBalance: 10_000,
            riskPct: 1,
          }),
        },
      );
      setSelected(data.sweep);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function cancelSweep(sweepId: string) {
    setBusy(true);
    try {
      await pluginFetch(`/sweeps/${encodeURIComponent(sweepId)}/cancel`, { method: 'POST' });
      await openSweep(sweepId);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function deleteSweep(sweepId: string) {
    if (!window.confirm('Delete this sweep and its results?')) return;
    setBusy(true);
    try {
      await pluginFetch(`/sweeps/${encodeURIComponent(sweepId)}`, { method: 'DELETE' });
      if (selected?.id === sweepId) setSelected(null);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const progress =
    selected && selected.total > 0 ? Math.round((selected.completed / selected.total) * 100) : 0;

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <div className="border-danger/30 bg-danger/5 text-danger flex items-start gap-2 rounded-lg border p-3 text-xs">
          <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <section className="surface-panel flex flex-col gap-3 rounded-xl border border-white/10 p-4">
        <div className="flex items-center gap-2">
          <IconFlask className="text-brand size-4" />
          <h2 className="text-fg text-sm font-semibold">Parameter sweep</h2>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-fg-subtle text-[10px] font-semibold uppercase">Strategy</span>
            <select
              value={strategyId}
              onChange={(event) => setStrategyId(event.target.value)}
              className={inputClass}
            >
              {strategies.length === 0 ? <option value="">No saved strategies</option> : null}
              {strategies.map((strategy) => (
                <option key={strategy.id} value={strategy.id}>
                  {strategy.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-fg-subtle text-[10px] font-semibold uppercase">Symbol</span>
            <input
              value={symbol}
              onChange={(event) => setSymbol(event.target.value.toUpperCase())}
              className={`${inputClass} font-mono`}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-fg-subtle text-[10px] font-semibold uppercase">Timeframe</span>
            <select
              value={timeframe}
              onChange={(event) => setTimeframe(event.target.value as typeof timeframe)}
              className={inputClass}
            >
              {TIMEFRAMES.map((tf) => (
                <option key={tf} value={tf}>
                  {tf}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-fg-subtle text-[10px] font-semibold uppercase">Objective</span>
            <select
              value={objective}
              onChange={(event) => setObjective(event.target.value as typeof objective)}
              className={inputClass}
            >
              {OBJECTIVES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-fg-subtle text-[10px] font-semibold uppercase">Max combos</span>
            <input
              type="number"
              min={1}
              max={200}
              value={maxCombinations}
              onChange={(event) => setMaxCombinations(Number(event.target.value) || 1)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-fg-subtle text-[10px] font-semibold uppercase">Min trades</span>
            <input
              type="number"
              min={1}
              max={1000}
              value={minTrades}
              onChange={(event) => setMinTrades(Number(event.target.value) || 1)}
              className={inputClass}
            />
          </label>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-fg-subtle text-[10px] font-semibold uppercase">
              Parameter grid
            </span>
            <button
              type="button"
              onClick={() => setParams((rows) => [...rows, { name: '', values: '' }])}
              className="text-fg-subtle hover:text-fg inline-flex items-center gap-1 text-[10px] font-semibold"
            >
              <IconPlus className="size-3" />
              Add parameter
            </button>
          </div>
          {params.map((row, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                value={row.name}
                onChange={(event) =>
                  setParams((rows) =>
                    rows.map((item, i) =>
                      i === index ? { ...item, name: event.target.value } : item,
                    ),
                  )
                }
                placeholder="paramName"
                className={`${inputClass} max-w-44 font-mono`}
                maxLength={40}
              />
              <input
                value={row.values}
                onChange={(event) =>
                  setParams((rows) =>
                    rows.map((item, i) =>
                      i === index ? { ...item, values: event.target.value } : item,
                    ),
                  )
                }
                placeholder="1, 2, 3"
                className={`${inputClass} font-mono`}
              />
              <button
                type="button"
                onClick={() => setParams((rows) => rows.filter((_, i) => i !== index))}
                disabled={params.length === 1}
                className="text-fg-subtle hover:text-danger inline-flex size-8 shrink-0 items-center justify-center rounded-md disabled:opacity-30"
                aria-label="Remove parameter"
              >
                <IconX className="size-3.5" />
              </button>
            </div>
          ))}
          <p className="text-fg-subtle text-[10px]">
            Values are typed automatically (numbers when numeric). The product of all value lists
            must stay under the max-combination limit.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void startSweep()}
          disabled={busy || strategies.length === 0}
          className="bg-brand/10 text-brand border-brand/30 hover:bg-brand/20 inline-flex h-9 items-center gap-1.5 self-start rounded-md border px-3 text-xs font-semibold disabled:opacity-40"
        >
          {busy ? (
            <IconLoader2 className="size-3.5 animate-spin" />
          ) : (
            <IconFlask className="size-3.5" />
          )}
          Run sweep
        </button>
      </section>

      {selected ? (
        <section className="surface-panel flex flex-col gap-3 rounded-xl border border-white/10 p-4">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-fg text-sm font-semibold">{selected.name}</h2>
              <p className="text-fg-subtle font-mono text-[10px]">
                {selected.symbol} · {selected.timeframe} · {selected.objective} ·{' '}
                {selected.completed}/{selected.total}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {selected.status === 'queued' || selected.status === 'running' ? (
                <button
                  type="button"
                  onClick={() => void cancelSweep(selected.id)}
                  disabled={busy}
                  className="border-warn/30 text-warn inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-[11px] font-semibold"
                >
                  Cancel
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void deleteSweep(selected.id)}
                  disabled={busy}
                  className="text-fg-subtle hover:text-danger inline-flex size-8 items-center justify-center rounded-md"
                  aria-label="Delete sweep"
                >
                  <IconTrash className="size-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => void openSweep(selected.id)}
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
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-fg-subtle text-[10px]">
                {selected.status === 'queued' ? 'Queued for the worker…' : `Running… ${progress}%`}
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

          {selected.results.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-[11px]">
                <thead className="text-fg-subtle text-[10px] uppercase">
                  <tr className="border-border/60 border-b">
                    <th className="py-1.5 pr-2 font-semibold">Params</th>
                    <th className="py-1.5 pr-2 text-right font-semibold">Trades</th>
                    <th className="py-1.5 pr-2 text-right font-semibold">Win</th>
                    <th className="py-1.5 pr-2 text-right font-semibold">PF</th>
                    <th className="py-1.5 pr-2 text-right font-semibold">Exp R</th>
                    <th className="py-1.5 pr-2 text-right font-semibold">Net P&L</th>
                    <th className="py-1.5 text-right font-semibold">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.results.slice(0, 20).map((result, index) => (
                    <tr key={index} className="border-border/40 border-b">
                      <td className="text-fg-muted max-w-64 truncate py-1.5 pr-2 font-mono text-[10px]">
                        {JSON.stringify(result.params)}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">
                        {result.metrics?.trades ?? '—'}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">
                        {result.metrics ? fmtPct(result.metrics.winRate) : '—'}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">
                        {result.metrics?.profitFactor.toFixed(2) ?? '—'}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">
                        {result.metrics?.expectancyR.toFixed(2) ?? '—'}
                      </td>
                      <td
                        className={`py-1.5 pr-2 text-right tabular-nums ${
                          result.metrics ? toneClass(result.metrics.netPnl) : ''
                        }`}
                      >
                        {result.metrics ? fmtMoney(result.metrics.netPnl) : '—'}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {result.score?.toFixed(3) ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-fg text-sm font-semibold">Recent sweeps</h2>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="text-fg-subtle hover:text-fg inline-flex items-center gap-1 text-[10px] font-semibold disabled:opacity-40"
          >
            {loading ? (
              <IconLoader2 className="size-3 animate-spin" />
            ) : (
              <IconRefresh className="size-3" />
            )}
            Refresh
          </button>
        </div>
        {sweeps.length === 0 ? (
          <p className="text-fg-subtle text-[11px]">No sweeps yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {sweeps.map((sweep) => (
              <li key={sweep.id}>
                <button
                  type="button"
                  onClick={() => void openSweep(sweep.id)}
                  className="border-border/50 hover:bg-bg-elev-2/50 flex w-full items-center justify-between gap-2 rounded-md border p-2 text-left"
                >
                  <span className="min-w-0">
                    <span className="text-fg block truncate text-[11px] font-semibold">
                      {sweep.name}
                    </span>
                    <span className="text-fg-subtle block font-mono text-[10px]">
                      {sweep.symbol} · {sweep.timeframe} · {sweep.status} · {sweep.completed}/
                      {sweep.total}
                    </span>
                  </span>
                  <span className="text-fg-subtle shrink-0 font-mono text-[10px]">
                    {sweep.bestScore !== null ? sweep.bestScore.toFixed(2) : '—'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
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
