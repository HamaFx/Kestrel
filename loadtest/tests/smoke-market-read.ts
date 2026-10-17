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

// Smoke test — market_read group (GET /api/market/* endpoints).
// Validates script wiring + SUT connectivity with minimal load.
// Run this FIRST before any other load test.
import { sleep } from 'k6';

import { smoke } from '../config/load-profiles.js';
import { MARKET_READ, MARKET_READ_TAGGED_RELAXED } from '../config/thresholds.js';
import { applyAuth, bootstrapAuth, pickUser } from '../lib/auth.js';
import { getJson, postJson } from '../lib/http.js';
import { handleSummary } from '../lib/summary.js';
import { marketRead } from '../scenarios/market-read.js';

export const options = {
  ...smoke(1, 3),
  thresholds: {
    http_req_failed: MARKET_READ.httpReqFailed,
    checks: MARKET_READ.checks,
    rate_limited: MARKET_READ.rateLimited,
    ...MARKET_READ_TAGGED_RELAXED,
  },
};

export function setup() {
  const ctxs = bootstrapAuth();

  // Warmup: prime DB connection pool, JIT compilation, and server caches
  // before any VU iterations start.
  if (ctxs[0]) {
    applyAuth(ctxs[0]);
    getJson('/api/health', 'warmup');
    getJson('/api/market/price?symbol=XAUUSD', 'warmup');
    getJson('/api/market/candles?symbol=XAUUSD&timeframe=1h', 'warmup');

    // Warm the compute-heavy POST endpoints — these benefit most from
    // a hot JIT compiler and populated DB/cache pipelines.
    postJson(
      '/api/market/indicators',
      'warmup',
      {
        symbol: 'XAUUSD',
        tf: '1h',
        indicators: [{ kind: 'sma', params: { period: 20 } }],
      },
    );
    postJson(
      '/api/market/structure',
      'warmup',
      { symbol: 'XAUUSD', tf: '1h' },
    );
  }

  return ctxs;
}

export default function (ctxs: ReturnType<typeof bootstrapAuth>) {
  const ctx = pickUser(ctxs);
  applyAuth(ctx);
  marketRead(ctx);
  sleep(0.5);
}

export { handleSummary };
