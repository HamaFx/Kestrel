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
import { IconAlertTriangle, IconFlask, IconLoader2, IconPlayerPlay } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import type { z } from 'zod';

import type { RunResultSchema, StrategySummarySchema } from '../schemas';
import { errorMessage, pluginFetch } from './api';

type StrategySummary = z.infer<typeof StrategySummarySchema>;
type RunResult = z.infer<typeof RunResultSchema>;

const STARTER_SOURCE = `function getSignal(ctx) {
  const fast = ctx.series('ema20');
  const slow = ctx.series('ema50');
  const atr = ctx.atr();
  if (fast === null || slow === null || atr === null) return null;

  if (fast > slow && ctx.close > fast) {
    const stop = ctx.close - atr * 1.5;
    const risk = ctx.close - stop;
    return {
      side: 'long',
      stop,
      target: ctx.close + risk * 2,
      maxBars: 40,
      trailing: { type: 'atr', value: 2 },
      reason: 'EMA trend continuation',
    };
  }
  if (fast < slow && ctx.close < fast) {
    const stop = ctx.close + atr * 1.5;
    const risk = stop - ctx.close;
    return {
      side: 'short',
      stop,
      target: ctx.close - risk * 2,
      maxBars: 40,
      trailing: { type: 'atr', value: 2 },
      reason: 'EMA trend continuation',
    };
  }
  return null;
}`;

const SYMBOLS = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'BTCUSDT', 'ETHUSDT'];

const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'];

type Prefill = {
  name: string;
  source: string;
  params: Record<string, unknown>;
  symbol?: string;
  timeframe?: string;
};

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-fg-subtle text-[10px] font-semibold tracking-wider uppercase">
        {label}
      </span>
      {children}
      {hint ? <span className="text-fg-subtle text-[10px]">{hint}</span> : null}
    </label>
  );
}

const inputClass =
  'border-border/60 bg-bg-elev-1 text-fg placeholder:text-fg-subtle focus:border-brand/60 h-9 rounded-md border px-2.5 font-mono text-xs outline-none';

export function NewRunForm({
  strategies,
  prefill,
  onStarted,
  onQueued,
}: {
  strategies: readonly StrategySummary[];
  prefill: Prefill | null;
  onStarted: (runId: string) => void;
  onQueued: (jobId: string) => void;
}) {
  const [name, setName] = useState(prefill?.name ?? '');
  const [symbol, setSymbol] = useState(prefill?.symbol ?? 'XAUUSD');
  const [timeframe, setTimeframe] = useState(prefill?.timeframe ?? '1h');
  const [count, setCount] = useState('1000');
  const [riskPct, setRiskPct] = useState('1');
  const [initialBalance, setInitialBalance] = useState('10000');
  const [leverage, setLeverage] = useState('');
  const [spread, setSpread] = useState('');
  const [slippage, setSlippage] = useState('');
  const [commission, setCommission] = useState('');
  const [source, setSource] = useState(prefill?.source ?? STARTER_SOURCE);
  const [params, setParams] = useState(prefill ? JSON.stringify(prefill.params, null, 2) : '{}');
  const [strategyId, setStrategyId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [background, setBackground] = useState(false);

  const selectedStrategy = useMemo(
    () => strategies.find((strategy) => strategy.id === strategyId) ?? null,
    [strategies, strategyId],
  );

  async function loadStrategy(id: string) {
    setStrategyId(id);
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      const response = await pluginFetch<{
        strategy: {
          name: string;
          source: string;
          params: Record<string, unknown>;
        };
      }>(`/strategies/${encodeURIComponent(id)}`);
      setName(response.strategy.name);
      setSource(response.strategy.source);
      setParams(JSON.stringify(response.strategy.params ?? {}, null, 2));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      let parsedParams: Record<string, unknown> = {};
      if (params.trim()) {
        const raw = JSON.parse(params) as unknown;
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
          throw new Error('Params must be a JSON object.');
        }
        parsedParams = raw as Record<string, unknown>;
      }
      const payload = {
        name: name.trim() || undefined,
        symbol,
        timeframe,
        source,
        params: parsedParams,
        count: Number(count),
        riskPct: Number(riskPct),
        initialBalance: Number(initialBalance),
        ...(leverage ? { leverage: Number(leverage) } : {}),
        ...(spread ? { spread: Number(spread) } : {}),
        ...(slippage ? { slippage: Number(slippage) } : {}),
        ...(commission ? { commissionPerUnit: Number(commission) } : {}),
        persist: true,
      };

      if (background) {
        const queued = await pluginFetch<{ jobId: string }>('/runs/async', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        onQueued(queued.jobId);
        return;
      }

      const response = await pluginFetch<{ run: RunResult }>('/runs', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      onStarted(response.run.runId);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="surface-panel flex flex-col gap-4 rounded-xl border border-white/10 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-brand/10 text-brand flex size-8 items-center justify-center rounded-md">
            <IconFlask className="size-4" />
          </span>
          <div>
            <h2 className="text-fg text-sm font-semibold">New backtest</h2>
            <p className="text-fg-subtle text-[11px]">
              Deterministic, next-bar fills, stop-first tie-breaks, real costs.
            </p>
          </div>
        </div>
        {strategies.length > 0 ? (
          <select
            value={strategyId}
            onChange={(event) => void loadStrategy(event.target.value)}
            className={inputClass}
            aria-label="Load a saved strategy"
          >
            <option value="">Load saved strategy…</option>
            {strategies.map((strategy) => (
              <option key={strategy.id} value={strategy.id}>
                {strategy.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label="Name">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={selectedStrategy?.name ?? 'Auto'}
            className={inputClass}
          />
        </Field>
        <Field label="Symbol">
          <input
            value={symbol}
            onChange={(event) => setSymbol(event.target.value.toUpperCase())}
            list="backtesting-symbols"
            className={inputClass}
          />
          <datalist id="backtesting-symbols">
            {SYMBOLS.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
        </Field>
        <Field label="Timeframe">
          <select
            value={timeframe}
            onChange={(event) => setTimeframe(event.target.value)}
            className={inputClass}
          >
            {TIMEFRAMES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Bars" hint="60–5000">
          <input
            type="number"
            min={60}
            max={5000}
            value={count}
            onChange={(event) => setCount(event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Risk / trade %">
          <input
            type="number"
            min={0.01}
            max={10}
            step={0.01}
            value={riskPct}
            onChange={(event) => setRiskPct(event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Starting balance">
          <input
            type="number"
            min={100}
            value={initialBalance}
            onChange={(event) => setInitialBalance(event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Leverage" hint="Blank = plugin default">
          <input
            type="number"
            min={1}
            max={500}
            value={leverage}
            onChange={(event) => setLeverage(event.target.value)}
            placeholder="Default"
            className={inputClass}
          />
        </Field>
        <Field label="Costs">
          <button
            type="button"
            onClick={() => setAdvanced((value) => !value)}
            className="border-border/60 text-fg-muted hover:text-fg h-9 rounded-md border px-2.5 text-xs"
          >
            {advanced ? 'Hide' : 'Show'} advanced
          </button>
        </Field>
      </div>

      {advanced ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Field label="Spread (price)" hint="Blank = 2 pips">
            <input
              type="number"
              min={0}
              step={0.00001}
              value={spread}
              onChange={(event) => setSpread(event.target.value)}
              placeholder="Default"
              className={inputClass}
            />
          </Field>
          <Field label="Slippage (price)" hint="Blank = 0.5 pips">
            <input
              type="number"
              min={0}
              step={0.00001}
              value={slippage}
              onChange={(event) => setSlippage(event.target.value)}
              placeholder="Default"
              className={inputClass}
            />
          </Field>
          <Field label="Commission / unit / side">
            <input
              type="number"
              min={0}
              step={0.01}
              value={commission}
              onChange={(event) => setCommission(event.target.value)}
              placeholder="Default"
              className={inputClass}
            />
          </Field>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-[1fr_220px]">
        <Field
          label="Strategy source"
          hint="Must define getSignal(ctx). Accessors reject future offsets."
        >
          <textarea
            value={source}
            onChange={(event) => setSource(event.target.value)}
            spellCheck={false}
            rows={16}
            className="border-border/60 bg-bg-elev-1 text-fg focus:border-brand/60 min-h-[260px] rounded-md border p-3 font-mono text-[11px] leading-relaxed outline-none"
          />
        </Field>
        <Field label="Params (JSON)" hint="Available as ctx.params">
          <textarea
            value={params}
            onChange={(event) => setParams(event.target.value)}
            spellCheck={false}
            rows={16}
            className="border-border/60 bg-bg-elev-1 text-fg focus:border-brand/60 min-h-[260px] rounded-md border p-3 font-mono text-[11px] leading-relaxed outline-none"
          />
        </Field>
      </div>

      {error ? (
        <div className="border-danger/30 bg-danger/5 text-danger flex items-start gap-2 rounded-lg border p-3 text-xs">
          <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span className="whitespace-pre-wrap">{error}</span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <label className="text-fg-subtle inline-flex items-center gap-1.5 text-[11px]">
          <input
            type="checkbox"
            checked={background}
            onChange={(event) => setBackground(event.target.checked)}
            className="border-border/60 size-3.5 rounded border accent-[var(--brand)]"
          />
          Run in background (worker)
        </label>
        <button
          type="submit"
          disabled={busy || source.trim().length < 20}
          className="bg-brand inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-medium text-white transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? (
            <IconLoader2 className="size-4 animate-spin" />
          ) : (
            <IconPlayerPlay className="size-4" />
          )}
          {busy
            ? background
              ? 'Queueing…'
              : 'Running…'
            : background
              ? 'Queue backtest'
              : 'Run backtest'}
        </button>
      </div>
    </form>
  );
}
