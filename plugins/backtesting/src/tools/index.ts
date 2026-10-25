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

// Agent tools shipped by the Backtesting Lab.
//
// Strategy execution is a computation, not a financial mutation: the run tool
// is `read-only` and never needs an approval card. Library writes (saving a
// strategy or knowledge note) are `write` because they persist user data, but
// they explicitly opt out of confirmation — they cannot move money or touch
// the market.
//
// This barrel keeps the previous `./tools` import path working.

import type { PluginToolRegistration } from '@kestrel/plugin-sdk';

import { knowledgeTools } from './knowledge';
import { runTools } from './runs';
import { strategyTools } from './strategies';
import { sweepTools } from './sweeps';

export const backtestingTools: readonly PluginToolRegistration[] = [
  ...runTools,
  ...strategyTools,
  ...sweepTools,
  ...knowledgeTools,
];
