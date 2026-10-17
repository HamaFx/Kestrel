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

// Smoke test — config mix (settings API: symbols, models, analysis mode,
// fallback chain, usage stats, provider tests).
// Validates script wiring + SUT connectivity across the full config surface.
import { sleep } from 'k6';

import { smoke } from '../config/load-profiles.js';
import { CONFIG_MIX, CONFIG_MIX_TAGGED_RELAXED } from '../config/thresholds.js';
import { applyAuth, bootstrapAuth, pickUser } from '../lib/auth.js';
import { expectOk } from '../lib/checks.js';
import { getJson, putJson } from '../lib/http.js';
import { handleSummary } from '../lib/summary.js';
import { configMix } from '../scenarios/config-mix.js';

export const options = {
  ...smoke(1, 5),
  thresholds: {
    http_req_failed: CONFIG_MIX.httpReqFailed,
    checks: CONFIG_MIX.checks,
    rate_limited: CONFIG_MIX.rateLimited,
    ...CONFIG_MIX_TAGGED_RELAXED,
  },
};

export function setup() {
  const ctxs = bootstrapAuth();

  // Warmup: prime DB connection pool, JIT compilation, and server caches
  // before any VU iterations start. Hits each config endpoint type once.
  if (ctxs[0]) {
    applyAuth(ctxs[0]);
    expectOk(getJson('/api/health', 'warmup'));
    expectOk(getJson('/api/settings/symbols', 'warmup'));
    expectOk(getJson('/api/settings/catalog', 'warmup'));
    expectOk(getJson('/api/settings/chat-model', 'warmup'));
    expectOk(getJson('/api/settings/analysis-mode', 'warmup'));
    expectOk(getJson('/api/settings/fallback-chain', 'warmup'));
    expectOk(getJson('/api/settings/usage-by-agent', 'warmup'));
    expectOk(getJson('/api/settings/usage-by-provider', 'warmup'));
    expectOk(getJson('/api/notifications/noise-config', 'warmup'));

    // Warm model config PUT path (may 400 if model not in spec — still primes JIT)
    expectOk(
      putJson('/api/settings/chat-model', 'warmup', {
        providerId: 'google',
        modelId: 'gemini-2.5-pro',
      }),
    );
  }

  return ctxs;
}

export default function (ctxs: ReturnType<typeof bootstrapAuth>) {
  const ctx = pickUser(ctxs);
  applyAuth(ctx);
  configMix(ctx);
  sleep(0.5);
}

export { handleSummary };
