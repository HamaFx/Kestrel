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

// Stress test — find the throughput ceiling for write-path endpoints.
// Ramps arrival-rate through steps (15→30→60→120 rps) until thresholds break.
// The GOAL is to observe where failures climb, not to pass every step.
// Write endpoints are inherently slower than reads — expect earlier breakage.
// Use --no-thresholds to keep running after first breach.
import { sleep } from 'k6';

import { env } from '../config/environments.js';
import { stress } from '../config/load-profiles.js';
import { STRESS, WRITE_MIX_TAGGED_RELAXED } from '../config/thresholds.js';
import { applyAuth, bootstrapAuth, pickUser } from '../lib/auth.js';
import { handleSummary } from '../lib/summary.js';
import { writeMix } from '../scenarios/write-mix.js';

const RPS_STEPS = (__ENV['K6_STRESS_STEPS'] ?? '15,30,60,120').split(',').map(Number);

const PRE_ALLOCATED_VUS = parseInt(__ENV['K6_PRE_ALLOCATED_VUS'] ?? '50', 10);
const MAX_VUS = parseInt(__ENV['K6_MAX_VUS'] ?? '200', 10);

export const options = {
  ...stress(RPS_STEPS, '1m', PRE_ALLOCATED_VUS, MAX_VUS),
  thresholds: {
    http_req_failed: STRESS.httpReqFailed,
    checks: STRESS.checks,
    rate_limited: STRESS.rateLimited,
    ...WRITE_MIX_TAGGED_RELAXED,
  },
};

export function setup() {
  return bootstrapAuth();
}

export default function (ctxs: ReturnType<typeof bootstrapAuth>) {
  const ctx = pickUser(ctxs);
  applyAuth(ctx);
  writeMix(ctx);
  sleep(0.1);
}

export { handleSummary };
