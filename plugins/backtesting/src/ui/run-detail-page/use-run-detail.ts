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

// Run detail page state: fetch the saved run and delete it.
import { useCallback, useEffect, useReducer } from 'react';
import type { z } from 'zod';

import type { RunDetailSchema } from '../../schemas';
import { errorMessage, pluginFetch } from '../api';
import { createInitialState, reducer, type DetailTab, type RunDetailState } from './state';

type RunDetail = z.infer<typeof RunDetailSchema>;

export type RunDetailController = ReturnType<typeof useRunDetail>;

export function useRunDetail(runId: string) {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);

  const patch = useCallback((next: Partial<RunDetailState>) => {
    dispatch({ type: 'patch', patch: next });
  }, []);

  const load = useCallback(async () => {
    if (!runId) {
      patch({ error: 'Missing run id.', loading: false });
      return;
    }
    patch({ loading: true, error: null });
    try {
      const response = await pluginFetch<{ run: RunDetail }>(`/runs/${encodeURIComponent(runId)}`);
      patch({ run: response.run });
    } catch (err) {
      patch({ error: errorMessage(err) });
    } finally {
      patch({ loading: false });
    }
  }, [runId, patch]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove() {
    if (!window.confirm('Delete this backtest run?')) return;
    patch({ deleting: true });
    try {
      await pluginFetch(`/runs/${encodeURIComponent(runId)}`, { method: 'DELETE' });
      window.location.assign('/plugins/backtesting');
    } catch (err) {
      patch({ error: errorMessage(err), deleting: false });
    }
  }

  return {
    ...state,
    load,
    remove,
    setTab: (tab: DetailTab) => dispatch({ type: 'setTab', tab }),
  };
}
