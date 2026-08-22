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

// Average-load test — write mix.
// Baseline for regression comparison on write-path endpoints.
// Profiles end-users creating/managing alerts, threads, journal entries,
// portfolio positions, and other stateful operations.
//
// Write paths are inherently slower than reads (DB writes, LLM calls for
// previews), so SLOs are more generous than the read-mix equivalents.
import { sleep } from 'k6';

import { env } from '../config/environments.js';
import { averageLoad } from '../config/load-profiles.js';
import { WRITE_MIX, WRITE_MIX_TAGGED_RELAXED } from '../config/thresholds.js';
import { applyAuth, bootstrapAuth, pickUser } from '../lib/auth.js';
import { handleSummary } from '../lib/summary.js';
import { writeMix } from '../scenarios/write-mix.js';

const TARGET_RPS = parseInt(__ENV['K6_TARGET_RPS'] ?? '15', 10);
const PRE_ALLOCATED_VUS = parseInt(__ENV['K6_PRE_ALLOCATED_VUS'] ?? '10', 10);
const MAX_VUS = parseInt(__ENV['K6_MAX_VUS'] ?? '40', 10);

export const options = {
  ...averageLoad(TARGET_RPS, PRE_ALLOCATED_VUS, MAX_VUS),
  thresholds: {
    http_req_failed: WRITE_MIX.httpReqFailed,
    checks: WRITE_MIX.checks,
    rate_limited: WRITE_MIX.rateLimited,
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
  sleep(0.5);
}

export { handleSummary };
