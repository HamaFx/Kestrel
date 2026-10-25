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

// Reducer state for the Backtesting Lab page.

import type { z } from 'zod';

import type {
  KnowledgeDocumentSummarySchema,
  RunSummarySchema,
  StrategySummarySchema,
} from '../../schemas';
import type { Tab } from './tabs';

type RunSummary = z.infer<typeof RunSummarySchema>;
type StrategySummary = z.infer<typeof StrategySummarySchema>;
type DocumentSummary = z.infer<typeof KnowledgeDocumentSummarySchema>;

export interface SummaryResponse {
  engineVersion: string;
  runCount: number;
  strategyCount: number;
  knowledgeCount: number;
  latestRun: RunSummary | null;
}

export interface BacktestPageState {
  tab: Tab;
  loading: boolean;
  error: string | null;
  summary: SummaryResponse | null;
  runs: RunSummary[];
  strategies: StrategySummary[];
  documents: DocumentSummary[];
  busyId: string | null;
  prefill: {
    name: string;
    source: string;
    params: Record<string, unknown>;
  } | null;
  formKey: number;
  queuedJobId: string | null;
  queueMessage: string | null;
}

export type BacktestPageAction =
  { type: 'patch'; patch: Partial<BacktestPageState> } | { type: 'resetForm' };

export function createInitialState(): BacktestPageState {
  return {
    tab: 'new',
    loading: true,
    error: null,
    summary: null,
    runs: [],
    strategies: [],
    documents: [],
    busyId: null,
    prefill: null,
    formKey: 0,
    queuedJobId: null,
    queueMessage: null,
  };
}

export function reducer(state: BacktestPageState, action: BacktestPageAction): BacktestPageState {
  switch (action.type) {
    case 'patch':
      return { ...state, ...action.patch };
    case 'resetForm':
      return { ...state, formKey: state.formKey + 1 };
  }
}
