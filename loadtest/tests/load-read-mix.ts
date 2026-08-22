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

// Average-load test — broad read mix.
// Baseline for regression comparison.
import { sleep } from 'k6';

import { env } from '../config/environments.js';
import { averageLoad } from '../config/load-profiles.js';
import { READ_MIX, READ_MIX_TAGGED_RELAXED } from '../config/thresholds.js';
import { applyAuth, bootstrapAuth, pickUser } from '../lib/auth.js';
import { handleSummary } from '../lib/summary.js';
import { readMix } from '../scenarios/read-mix.js';

const TARGET_RPS = parseInt(__ENV['K6_TARGET_RPS'] ?? '30', 10);
const PRE_ALLOCATED_VUS = parseInt(__ENV['K6_PRE_ALLOCATED_VUS'] ?? '15', 10);
const MAX_VUS = parseInt(__ENV['K6_MAX_VUS'] ?? '80', 10);

export const options = {
  ...averageLoad(TARGET_RPS, PRE_ALLOCATED_VUS, MAX_VUS),
  thresholds: {
    http_req_failed: READ_MIX.httpReqFailed,
    checks: READ_MIX.checks,
    rate_limited: READ_MIX.rateLimited,
    ...READ_MIX_TAGGED_RELAXED,
  },
};

export function setup() {
  return bootstrapAuth();
}

export default function (ctxs: ReturnType<typeof bootstrapAuth>) {
  const ctx = pickUser(ctxs);
  applyAuth(ctx);
  readMix(ctx);
  sleep(0.5);
}

export { handleSummary };
