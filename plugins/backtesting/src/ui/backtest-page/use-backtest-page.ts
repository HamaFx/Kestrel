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

// Backtesting Lab page state: summary/run/strategy/knowledge loading, queued
// job polling and the mutation handlers. All state and effects live here so
// the page shell stays presentational.
import { useCallback, useEffect, useReducer } from 'react';
import type { z } from 'zod';

import type {
  KnowledgeDocumentSummarySchema,
  RunJobStatus,
  RunSummarySchema,
  StrategySummarySchema,
} from '../../schemas';
import { errorMessage, pluginFetch } from '../api';
import { createInitialState, reducer, type BacktestPageState, type SummaryResponse } from './state';

type RunSummary = z.infer<typeof RunSummarySchema>;
type StrategySummary = z.infer<typeof StrategySummarySchema>;
type DocumentSummary = z.infer<typeof KnowledgeDocumentSummarySchema>;

export type BacktestPageController = ReturnType<typeof useBacktestPage>;

export function useBacktestPage() {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);

  const patch = useCallback((next: Partial<BacktestPageState>) => {
    dispatch({ type: 'patch', patch: next });
  }, []);

  const load = useCallback(async () => {
    patch({ loading: true, error: null });
    const [summaryResult, runsResult, strategiesResult, knowledgeResult] = await Promise.allSettled(
      [
        pluginFetch<SummaryResponse>('/summary'),
        pluginFetch<{ runs: RunSummary[] }>('/runs?limit=50'),
        pluginFetch<{ strategies: StrategySummary[] }>('/strategies?limit=50'),
        pluginFetch<{ documents: DocumentSummary[] }>('/knowledge'),
      ],
    );

    if (summaryResult.status === 'fulfilled') patch({ summary: summaryResult.value });
    if (runsResult.status === 'fulfilled') patch({ runs: runsResult.value.runs });
    if (strategiesResult.status === 'fulfilled') {
      patch({ strategies: strategiesResult.value.strategies });
    }
    if (knowledgeResult.status === 'fulfilled') {
      patch({ documents: knowledgeResult.value.documents });
    }

    const failure = [summaryResult, runsResult, strategiesResult, knowledgeResult].find(
      (result) => result.status === 'rejected',
    );
    if (failure?.status === 'rejected') patch({ error: errorMessage(failure.reason) });
    patch({ loading: false });
  }, [patch]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const queuedJobId = state.queuedJobId;
    if (!queuedJobId) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const status = await pluginFetch<RunJobStatus>(`/jobs/${encodeURIComponent(queuedJobId)}`);
        if (cancelled) return;
        patch({ queueMessage: status.message });
        if (status.state === 'completed' && status.runId) {
          window.location.assign(`/plugins/backtesting/runs/${encodeURIComponent(status.runId)}`);
          return;
        }
        if (status.state === 'failed' || status.state === 'cancelled') {
          patch({
            error: status.error ?? 'The background backtest failed.',
            queuedJobId: null,
            queueMessage: null,
          });
        }
      } catch (err) {
        if (cancelled) return;
        patch({ error: errorMessage(err), queuedJobId: null, queueMessage: null });
      }
    };

    void poll();
    const timer = setInterval(() => {
      void poll();
    }, 2_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [state.queuedJobId, patch]);

  const loadStrategyIntoForm = useCallback(
    async (strategy: StrategySummary) => {
      patch({ busyId: strategy.id, error: null });
      try {
        const response = await pluginFetch<{
          strategy: {
            name: string;
            source: string;
            params: Record<string, unknown>;
          };
        }>(`/strategies/${encodeURIComponent(strategy.id)}`);
        patch({ prefill: response.strategy, tab: 'new' });
        dispatch({ type: 'resetForm' });
      } catch (err) {
        patch({ error: errorMessage(err) });
      } finally {
        patch({ busyId: null });
      }
    },
    [patch],
  );

  const removeRun = useCallback(
    async (runId: string) => {
      if (!window.confirm('Delete this backtest run? This cannot be undone.')) return;
      patch({ busyId: runId });
      try {
        await pluginFetch(`/runs/${encodeURIComponent(runId)}`, { method: 'DELETE' });
        await load();
      } catch (err) {
        patch({ error: errorMessage(err) });
      } finally {
        patch({ busyId: null });
      }
    },
    [load, patch],
  );

  const removeStrategy = useCallback(
    async (strategyId: string) => {
      if (!window.confirm('Delete this saved strategy?')) return;
      patch({ busyId: strategyId });
      try {
        await pluginFetch(`/strategies/${encodeURIComponent(strategyId)}`, {
          method: 'DELETE',
        });
        await load();
      } catch (err) {
        patch({ error: errorMessage(err) });
      } finally {
        patch({ busyId: null });
      }
    },
    [load, patch],
  );

  return {
    ...state,
    load,
    loadStrategyIntoForm,
    removeRun,
    removeStrategy,
    setTab: (value: BacktestPageState['tab']) => patch({ tab: value }),
    startQueue: (jobId: string) =>
      patch({ queuedJobId: jobId, queueMessage: 'Waiting for a worker…', tab: 'runs' }),
  };
}
