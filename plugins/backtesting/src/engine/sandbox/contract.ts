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

// The exact contract a strategy can rely on (exposed for tests).

import { SERIES_NAMES } from '../features';
import type { StrategySignal } from '../types';

/** Exposed for tests: the exact contract a strategy can rely on. */
export const STRATEGY_CONTRACT = {
  signalFields: [
    'side',
    'entry',
    'stop',
    'target',
    'riskPct',
    'maxBars',
    'validBars',
    'trailing',
    'breakEvenAtR',
    'reason',
    'tags',
  ] as const satisfies readonly (keyof StrategySignal)[],
  series: SERIES_NAMES,
} as const;
