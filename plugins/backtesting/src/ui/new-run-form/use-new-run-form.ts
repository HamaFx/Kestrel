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

// New-run form state and submission.
//
// All 17 fields live in one reducer so the form components stay
// presentational; the request payloads are unchanged from the original
// single-file implementation.
import { useMemo, useReducer } from 'react';
import type { z } from 'zod';

import type { RunResultSchema, StrategySummarySchema } from '../../schemas';
import { errorMessage, pluginFetch } from '../api';
import type { Prefill } from './constants';
import { createInitialState, reducer, type NewRunFormState } from './state';

type StrategySummary = z.infer<typeof StrategySummarySchema>;
type RunResult = z.infer<typeof RunResultSchema>;

export type NewRunFormController = ReturnType<typeof useNewRunForm>;

export function useNewRunForm({
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
  const [state, dispatch] = useReducer(reducer, prefill, createInitialState);

  const patch = (next: Partial<NewRunFormState>) => dispatch({ type: 'patch', patch: next });

  const selectedStrategy = useMemo(
    () => strategies.find((strategy) => strategy.id === state.strategyId) ?? null,
    [strategies, state.strategyId],
  );

  async function loadStrategy(id: string) {
    patch({ strategyId: id });
    if (!id) return;
    patch({ busy: true, error: null });
    try {
      const response = await pluginFetch<{
        strategy: {
          name: string;
          source: string;
          params: Record<string, unknown>;
        };
      }>(`/strategies/${encodeURIComponent(id)}`);
      patch({
        name: response.strategy.name,
        source: response.strategy.source,
        params: JSON.stringify(response.strategy.params ?? {}, null, 2),
      });
    } catch (err) {
      patch({ error: errorMessage(err) });
    } finally {
      patch({ busy: false });
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    patch({ busy: true, error: null });
    try {
      let parsedParams: Record<string, unknown> = {};
      if (state.params.trim()) {
        const raw = JSON.parse(state.params) as unknown;
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
          throw new Error('Params must be a JSON object.');
        }
        parsedParams = raw as Record<string, unknown>;
      }
      const payload = {
        name: state.name.trim() || undefined,
        symbol: state.symbol,
        timeframe: state.timeframe,
        source: state.source,
        params: parsedParams,
        count: Number(state.count),
        riskPct: Number(state.riskPct),
        initialBalance: Number(state.initialBalance),
        ...(state.leverage ? { leverage: Number(state.leverage) } : {}),
        ...(state.spread ? { spread: Number(state.spread) } : {}),
        ...(state.slippage ? { slippage: Number(state.slippage) } : {}),
        ...(state.commission ? { commissionPerUnit: Number(state.commission) } : {}),
        persist: true,
      };

      if (state.background) {
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
      patch({ error: errorMessage(err) });
    } finally {
      patch({ busy: false });
    }
  }

  return {
    name: state.name,
    symbol: state.symbol,
    timeframe: state.timeframe,
    count: state.count,
    riskPct: state.riskPct,
    initialBalance: state.initialBalance,
    leverage: state.leverage,
    spread: state.spread,
    slippage: state.slippage,
    commission: state.commission,
    source: state.source,
    params: state.params,
    strategyId: state.strategyId,
    busy: state.busy,
    error: state.error,
    advanced: state.advanced,
    background: state.background,
    selectedStrategy,
    loadStrategy,
    submit,
    setName: (value: string) => patch({ name: value }),
    setSymbol: (value: string) => patch({ symbol: value }),
    setTimeframe: (value: string) => patch({ timeframe: value }),
    setCount: (value: string) => patch({ count: value }),
    setRiskPct: (value: string) => patch({ riskPct: value }),
    setInitialBalance: (value: string) => patch({ initialBalance: value }),
    setLeverage: (value: string) => patch({ leverage: value }),
    setSpread: (value: string) => patch({ spread: value }),
    setSlippage: (value: string) => patch({ slippage: value }),
    setCommission: (value: string) => patch({ commission: value }),
    setSource: (value: string) => patch({ source: value }),
    setParams: (value: string) => patch({ params: value }),
    setBackground: (value: boolean) => patch({ background: value }),
    toggleAdvanced: () => dispatch({ type: 'toggleAdvanced' }),
  };
}
