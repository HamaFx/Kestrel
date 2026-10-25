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

// Data + actions for the Paper Trading page.
//
// Keeping the state machine outside the page shell lets the rendered layout
// stay a thin presentational component.

import { useCallback, useEffect, useState } from 'react';
import type { z } from 'zod';

import type { StrategyRunSchema, SummaryOutputSchema } from '../../schemas';
import { errorMessage, pluginFetch } from '../api';

export type Summary = z.infer<typeof SummaryOutputSchema>;
export type StrategyRun = z.infer<typeof StrategyRunSchema>;

export function usePaperPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [strategyRuns, setStrategyRuns] = useState<StrategyRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextSummary, nextRuns] = await Promise.all([
        pluginFetch<Summary>('/summary'),
        pluginFetch<{ runs: StrategyRun[] }>('/strategy-runs'),
      ]);
      setSummary(nextSummary);
      setStrategyRuns(nextRuns.runs);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      void load();
    }, 15_000);
    return () => clearInterval(timer);
  }, [load]);

  const closePosition = useCallback(
    async (positionId: string, quantity?: number) => {
      setBusyId(positionId);
      setError(null);
      try {
        await pluginFetch(`/positions/${encodeURIComponent(positionId)}/close`, {
          method: 'POST',
          body: JSON.stringify(quantity !== undefined ? { quantity } : {}),
        });
        await load();
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const cancelOrder = useCallback(
    async (orderId: string) => {
      setBusyId(orderId);
      setError(null);
      try {
        await pluginFetch(`/orders/${encodeURIComponent(orderId)}`, { method: 'DELETE' });
        await load();
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const resetAccount = useCallback(
    async (accountId: string) => {
      if (!window.confirm('Reset this account? Positions, orders and fills will be deleted.')) {
        return;
      }
      setBusyId(accountId);
      setError(null);
      try {
        await pluginFetch(`/accounts/${encodeURIComponent(accountId)}/reset`, {
          method: 'POST',
          body: JSON.stringify({ confirm: true }),
        });
        await load();
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const strategyRunAction = useCallback(
    async (run: StrategyRun, action: 'pause' | 'resume' | 'stop') => {
      setBusyId(run.id);
      setError(null);
      try {
        await pluginFetch(`/strategy-runs/${encodeURIComponent(run.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ action }),
        });
        await load();
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const deleteStrategyRun = useCallback(
    async (run: StrategyRun) => {
      if (!window.confirm(`Delete the deployed strategy "${run.name}"?`)) return;
      setBusyId(run.id);
      setError(null);
      try {
        await pluginFetch(`/strategy-runs/${encodeURIComponent(run.id)}`, { method: 'DELETE' });
        await load();
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  return {
    summary,
    strategyRuns,
    loading,
    error,
    busyId,
    load,
    closePosition,
    cancelOrder,
    resetAccount,
    strategyRunAction,
    deleteStrategyRun,
  };
}
