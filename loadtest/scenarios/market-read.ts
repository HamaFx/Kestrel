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

// Per-iteration VU function: hits the five market_read GET endpoints in a
// weighted mix, with randomized think-time between calls.
import { randomItem } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';
import { sleep } from 'k6';
import { SharedArray } from 'k6/data';

import type { SessionCtx } from '../config/environments.js';
import { getJson, postJson } from '../lib/http.js';

const symbols = new SharedArray(
  'symbols',
  () => JSON.parse(open('../lib/data/symbols.json') as string) as string[],
);

export function marketRead(_ctx: SessionCtx): void {
  const symbol = randomItem(symbols);

  // Weighted mix of the five market_read endpoints
  const roll = Math.random();

  if (roll < 0.4) {
    // Price (40% — most common poll)
    getJson(`/api/market/price?symbol=${symbol}`, 'market_read');
  } else if (roll < 0.6) {
    // Candles (20%)
    getJson(`/api/market/candles?symbol=${symbol}&timeframe=1h`, 'market_read');
  } else if (roll < 0.75) {
    // Indicators (15%) — POST required, slower than GET endpoints,
    // tagged separately so thresholds don't conflate fast & slow populations.
    postJson('/api/market/indicators', 'market_read_slow', {
      symbol,
      tf: '1h',
      indicators: [
        { kind: 'sma', params: { period: 20 } },
        { kind: 'rsi', params: { period: 14 } },
      ],
    });
  } else if (roll < 0.9) {
    // Structure (15%) — POST required, slower than GET endpoints
    postJson('/api/market/structure', 'market_read_slow', {
      symbol,
      tf: '1h',
    });
  } else {
    // Search (10%)
    getJson(`/api/market/search?q=${encodeURIComponent(symbol)}`, 'market_read');
  }

  // Randomized think-time: 0.5–2 seconds
  sleep(0.5 + Math.random() * 1.5);
}
