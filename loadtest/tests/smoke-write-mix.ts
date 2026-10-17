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

// Smoke test — write mix (POST-heavy endpoints: alerts, threads, journal,
// portfolio, onboarding, push subscribe, decision signals).
// Validates script wiring + SUT connectivity with minimal load.
// Run this FIRST before any write-path load test.
//
// Warmup phase creates seed resources so subsequent VU iterations have
// existing data to work with.
import { sleep } from 'k6';

import { smoke } from '../config/load-profiles.js';
import { WRITE_MIX, WRITE_MIX_TAGGED_RELAXED } from '../config/thresholds.js';
import { applyAuth, bootstrapAuth, pickUser } from '../lib/auth.js';
import { expectOk } from '../lib/checks.js';
import { getJson, postJson } from '../lib/http.js';
import { handleSummary } from '../lib/summary.js';
import { writeMix } from '../scenarios/write-mix.js';

export const options = {
  ...smoke(1, 5),
  thresholds: {
    http_req_failed: WRITE_MIX.httpReqFailed,
    checks: WRITE_MIX.checks,
    rate_limited: WRITE_MIX.rateLimited,
    ...WRITE_MIX_TAGGED_RELAXED,
  },
};

export function setup() {
  const ctxs = bootstrapAuth();

  // Warmup: prime DB connection pool, JIT compilation, and server caches
  // before any VU iterations start. Creates seed data so GET/PATCH/DELETE
  // endpoints have resources to operate on.
  if (ctxs[0]) {
    applyAuth(ctxs[0]);

    // 1. Prime health + general readiness
    expectOk(getJson('/api/health', 'warmup'));

    // 2. Create a seed thread (will be used by GET/PATCH/POST/fork in VU iterations)
    const threadRes = postJson('/api/chat/threads', 'warmup', { pinnedSymbol: 'XAUUSD' });
    let threadId: string | null = null;
    try {
      const body = JSON.parse(threadRes.body as string);
      threadId = body.thread?.id ?? null;
    } catch {
      // ignore parse failures
    }

    // 3. Warm the compute-heavy POST endpoints.
    expectOk(
      postJson('/api/alerts/preview', 'warmup', {
        rule: { type: 'priceCross', symbol: 'XAUUSD', direction: 'above', level: 2100 },
        lookbackDays: 30,
      }),
    );
    expectOk(
      postJson('/api/alerts', 'warmup', {
        rule: { type: 'priceCross', symbol: 'XAUUSD', direction: 'above', level: 2100 },
        channels: ['email'],
        note: 'k6 warmup',
        snoozeHours: 0,
      }),
    );
    expectOk(
      postJson('/api/journal', 'warmup', {
        symbol: 'XAUUSD',
        side: 'long',
        openedAt: Date.now() - 86400000 * 7,
        entry: 1950,
        stop: 1900,
        target: 2050,
        size: 1,
        notes: 'k6 warmup entry',
        tags: ['k6', 'warmup'],
      }),
    );
    expectOk(
      postJson('/api/portfolio/positions', 'warmup', {
        symbol: 'XAUUSD',
        direction: 'long',
        entryPrice: 1950,
        stopLoss: 1900,
        takeProfit: 2050,
        lotSize: 1,
        openedAt: Date.now(),
      }),
    );
    expectOk(
      postJson('/api/onboarding/save-progress', 'warmup', {
        step: 5,
        name: 'k6 warmup user',
        timezone: 'UTC',
        tradingStyle: 'swing',
      }),
    );
    expectOk(
      postJson('/api/journal/import', 'warmup', {
        trades: [
          {
            symbol: 'XAUUSD',
            side: 'long',
            entry: 1930,
            stop: 1900,
            target: 2000,
            exit: 2010,
            size: 2,
            openedAt: Date.now() - 86400000 * 14,
            closedAt: Date.now() - 86400000 * 7,
            notes: 'k6 warmup import',
          },
          {
            symbol: 'EURUSD',
            side: 'short',
            entry: 1.08,
            stop: 1.09,
            target: 1.05,
            exit: 1.04,
            size: 50000,
            openedAt: Date.now() - 86400000 * 10,
            closedAt: Date.now() - 86400000 * 5,
            notes: 'k6 warmup import 2',
          },
        ],
      }),
    );
  }

  return ctxs;
}

export default function (ctxs: ReturnType<typeof bootstrapAuth>) {
  const ctx = pickUser(ctxs);
  applyAuth(ctx);
  writeMix(ctx);
  sleep(0.5);
}

export { handleSummary };
