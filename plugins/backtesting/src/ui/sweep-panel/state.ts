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

// Reducer state for the parameter-sweep panel.

import type { z } from 'zod';

import type { StrategySummarySchema, SweepDetailSchema, SweepSummarySchema } from '../../schemas';
import type { ParamRow, SweepObjective, SweepTimeframe } from './constants';

type SweepSummary = z.infer<typeof SweepSummarySchema>;
type SweepDetail = z.infer<typeof SweepDetailSchema>;
type StrategySummary = z.infer<typeof StrategySummarySchema>;

export interface SweepPanelState {
  sweeps: SweepSummary[];
  selected: SweepDetail | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  strategyId: string;
  symbol: string;
  timeframe: SweepTimeframe;
  objective: SweepObjective;
  maxCombinations: number;
  minTrades: number;
  params: ParamRow[];
}

export type SweepPanelAction =
  | { type: 'patch'; patch: Partial<SweepPanelState> }
  | { type: 'params'; update: (rows: ParamRow[]) => ParamRow[] };

export function createInitialState(strategies: readonly StrategySummary[]): SweepPanelState {
  return {
    sweeps: [],
    selected: null,
    loading: true,
    busy: false,
    error: null,
    strategyId: strategies[0]?.id ?? '',
    symbol: 'XAUUSD',
    timeframe: '1h',
    objective: 'expectancyR',
    maxCombinations: 30,
    minTrades: 5,
    params: [{ name: '', values: '' }],
  };
}

export function reducer(state: SweepPanelState, action: SweepPanelAction): SweepPanelState {
  switch (action.type) {
    case 'patch':
      return { ...state, ...action.patch };
    case 'params':
      return { ...state, params: action.update(state.params) };
  }
}
