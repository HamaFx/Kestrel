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

// Sweep-panel state and API actions.
//
// All state and effects live here so the panel components stay
// presentational; the polling effect and request payloads are unchanged
// from the original single-file implementation.
import { useCallback, useEffect, useReducer } from 'react';
import type { z } from 'zod';

import type { StrategySummarySchema, SweepDetailSchema, SweepSummarySchema } from '../../schemas';
import { errorMessage, pluginFetch } from '../api';
import type { ParamRow, SweepObjective, SweepTimeframe } from './constants';
import { createInitialState, reducer, type SweepPanelState } from './state';

type SweepSummary = z.infer<typeof SweepSummarySchema>;
type SweepDetail = z.infer<typeof SweepDetailSchema>;
type StrategySummary = z.infer<typeof StrategySummarySchema>;

export type SweepPanelController = ReturnType<typeof useSweepPanel>;

export function useSweepPanel(strategies: readonly StrategySummary[]) {
  const [state, dispatch] = useReducer(reducer, strategies, createInitialState);

  const patch = useCallback((next: Partial<SweepPanelState>) => {
    dispatch({ type: 'patch', patch: next });
  }, []);

  const setParams = useCallback((update: (rows: ParamRow[]) => ParamRow[]) => {
    dispatch({ type: 'params', update });
  }, []);

  const load = useCallback(async () => {
    patch({ loading: true, error: null });
    try {
      const data = await pluginFetch<{ sweeps: SweepSummary[] }>('/sweeps?limit=20');
      patch({ sweeps: data.sweeps });
    } catch (err) {
      patch({ error: errorMessage(err) });
    } finally {
      patch({ loading: false });
    }
  }, [patch]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!state.strategyId && strategies[0]?.id) {
      patch({ strategyId: strategies[0].id });
    }
  }, [strategies, state.strategyId, patch]);

  useEffect(() => {
    const selected = state.selected;
    if (!selected || (selected.status !== 'queued' && selected.status !== 'running')) return;
    let cancelled = false;
    const timer = setInterval(() => {
      pluginFetch<{ sweep: SweepDetail }>(`/sweeps/${encodeURIComponent(selected.id)}`)
        .then((data) => {
          if (cancelled) return;
          patch({ selected: data.sweep });
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
  }, [state.selected, load, patch]);

  async function openSweep(sweepId: string) {
    patch({ error: null });
    try {
      const data = await pluginFetch<{ sweep: SweepDetail }>(
        `/sweeps/${encodeURIComponent(sweepId)}`,
      );
      patch({ selected: data.sweep });
    } catch (err) {
      patch({ error: errorMessage(err) });
    }
  }

  async function startSweep() {
    patch({ error: null, busy: true });
    try {
      const parameterSpace = state.params
        .map((row) => ({
          name: row.name.trim(),
          values: row.values
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean)
            .map((value) => (Number.isFinite(Number(value)) ? Number(value) : value)),
        }))
        .filter((row) => row.name && row.values.length > 0);
      if (!state.strategyId) throw new Error('Pick a saved strategy first.');
      if (parameterSpace.length === 0) {
        throw new Error('Add at least one parameter with one or more comma-separated values.');
      }
      const data = await pluginFetch<{ sweep: SweepDetail; jobId: string | null; message: string }>(
        '/sweeps',
        {
          method: 'POST',
          body: JSON.stringify({
            strategyId: state.strategyId,
            symbol: state.symbol,
            timeframe: state.timeframe,
            parameterSpace,
            objective: state.objective,
            maxCombinations: state.maxCombinations,
            minTrades: state.minTrades,
            count: 1000,
            initialBalance: 10_000,
            riskPct: 1,
          }),
        },
      );
      patch({ selected: data.sweep });
      await load();
    } catch (err) {
      patch({ error: errorMessage(err) });
    } finally {
      patch({ busy: false });
    }
  }

  async function cancelSweep(sweepId: string) {
    patch({ busy: true });
    try {
      await pluginFetch(`/sweeps/${encodeURIComponent(sweepId)}/cancel`, { method: 'POST' });
      await openSweep(sweepId);
      await load();
    } catch (err) {
      patch({ error: errorMessage(err) });
    } finally {
      patch({ busy: false });
    }
  }

  async function deleteSweep(sweepId: string) {
    if (!window.confirm('Delete this sweep and its results?')) return;
    patch({ busy: true });
    try {
      await pluginFetch(`/sweeps/${encodeURIComponent(sweepId)}`, { method: 'DELETE' });
      if (state.selected?.id === sweepId) patch({ selected: null });
      await load();
    } catch (err) {
      patch({ error: errorMessage(err) });
    } finally {
      patch({ busy: false });
    }
  }

  const progress =
    state.selected && state.selected.total > 0
      ? Math.round((state.selected.completed / state.selected.total) * 100)
      : 0;

  return {
    sweeps: state.sweeps,
    selected: state.selected,
    loading: state.loading,
    busy: state.busy,
    error: state.error,
    strategyId: state.strategyId,
    symbol: state.symbol,
    timeframe: state.timeframe,
    objective: state.objective,
    maxCombinations: state.maxCombinations,
    minTrades: state.minTrades,
    params: state.params,
    progress,
    load,
    openSweep,
    startSweep,
    cancelSweep,
    deleteSweep,
    setStrategyId: (value: string) => patch({ strategyId: value }),
    setSymbol: (value: string) => patch({ symbol: value }),
    setTimeframe: (value: SweepTimeframe) => patch({ timeframe: value }),
    setObjective: (value: SweepObjective) => patch({ objective: value }),
    setMaxCombinations: (value: number) => patch({ maxCombinations: value }),
    setMinTrades: (value: number) => patch({ minTrades: value }),
    setParams,
  };
}
