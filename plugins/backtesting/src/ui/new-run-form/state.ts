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

// Reducer state for the new-run form.

import { STARTER_SOURCE, type Prefill } from './constants';

export interface NewRunFormState {
  name: string;
  symbol: string;
  timeframe: string;
  count: string;
  riskPct: string;
  initialBalance: string;
  leverage: string;
  spread: string;
  slippage: string;
  commission: string;
  source: string;
  params: string;
  strategyId: string;
  busy: boolean;
  error: string | null;
  advanced: boolean;
  background: boolean;
}

export type NewRunFormAction =
  { type: 'patch'; patch: Partial<NewRunFormState> } | { type: 'toggleAdvanced' };

export function createInitialState(prefill: Prefill | null): NewRunFormState {
  return {
    name: prefill?.name ?? '',
    symbol: prefill?.symbol ?? 'XAUUSD',
    timeframe: prefill?.timeframe ?? '1h',
    count: '1000',
    riskPct: '1',
    initialBalance: '10000',
    leverage: '',
    spread: '',
    slippage: '',
    commission: '',
    source: prefill?.source ?? STARTER_SOURCE,
    params: prefill ? JSON.stringify(prefill.params, null, 2) : '{}',
    strategyId: '',
    busy: false,
    error: null,
    advanced: false,
    background: false,
  };
}

export function reducer(state: NewRunFormState, action: NewRunFormAction): NewRunFormState {
  switch (action.type) {
    case 'patch':
      return { ...state, ...action.patch };
    case 'toggleAdvanced':
      return { ...state, advanced: !state.advanced };
  }
}
