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

// SPDX-License-Identifier: Apache-2.0

// Closed-bar selection for alert readings (DEC-05 split from evaluator.ts).

import { msPerTimeframe, type Candle, type Timeframe } from '@kestrel/shared';

export function lastClosedBar(candles: Candle[], tf: Timeframe): Candle | null {
  // A bar is closed iff its open time + timeframe duration is in the past
  // (i.e. the next bar has already opened). The previous implementation
  // looked for bars whose OPEN time was ≥ 1 timeframe ago, which returned
  // the bar BEFORE the most recently closed one — alerts on a 1h chart
  // compared against a candle that closed roughly 2h ago.
  const tfDur = msPerTimeframe(tf);
  const now = Date.now();
  for (let i = candles.length - 1; i >= 0; i -= 1) {
    const bar = candles[i]!;
    if (bar.t + tfDur <= now) return bar;
  }
  return null;
}
