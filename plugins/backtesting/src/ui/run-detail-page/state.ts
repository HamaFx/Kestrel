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

// Reducer state for the run detail page.

import type { z } from 'zod';

import type { RunDetailSchema } from '../../schemas';

type RunDetail = z.infer<typeof RunDetailSchema>;

export type DetailTab = 'trades' | 'diagnostics' | 'source';

export interface RunDetailState {
  run: RunDetail | null;
  loading: boolean;
  error: string | null;
  tab: DetailTab;
  deleting: boolean;
}

export type RunDetailAction =
  { type: 'patch'; patch: Partial<RunDetailState> } | { type: 'setTab'; tab: DetailTab };

export function createInitialState(): RunDetailState {
  return {
    run: null,
    loading: true,
    error: null,
    tab: 'trades',
    deleting: false,
  };
}

export function reducer(state: RunDetailState, action: RunDetailAction): RunDetailState {
  switch (action.type) {
    case 'patch':
      return { ...state, ...action.patch };
    case 'setTab':
      return { ...state, tab: action.tab };
  }
}
