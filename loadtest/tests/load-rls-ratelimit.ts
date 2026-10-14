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

import { sleep } from 'k6';

import { smoke } from '../config/load-profiles.js';
import { RLS_ISOLATION, RLS_ISOLATION_TAGGED } from '../config/thresholds.js';
import { applyAuth, bootstrapAuth } from '../lib/auth.js';
import { handleSummary } from '../lib/summary.js';
import { rlsIsolation } from '../scenarios/rls-isolation.js';

export const options = {
  ...smoke(2, 5),
  thresholds: {
    http_req_failed: RLS_ISOLATION.httpReqFailed,
    checks: RLS_ISOLATION.checks,
    rate_limited: RLS_ISOLATION.rateLimited,
    ...RLS_ISOLATION_TAGGED,
  },
};

export function setup() {
  return bootstrapAuth();
}

export default function (ctxs: ReturnType<typeof bootstrapAuth>) {
  const ctxA = ctxs[0];
  const ctxB = ctxs[1] || ctxs[0];
  if (ctxA) {
    applyAuth(ctxA);
    rlsIsolation(ctxA, ctxB);
  }
  sleep(0.5);
}

export { handleSummary };
