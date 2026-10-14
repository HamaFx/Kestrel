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
import { WORKER_CRON, WORKER_CRON_TAGGED } from '../config/thresholds.js';
import { applyAuth, bootstrapAuth, pickUser } from '../lib/auth.js';
import { handleSummary } from '../lib/summary.js';
import { workerAndCron } from '../scenarios/worker-and-cron.js';

export const options = {
  ...smoke(2, 5),
  thresholds: {
    http_req_failed: WORKER_CRON.httpReqFailed,
    checks: WORKER_CRON.checks,
    rate_limited: WORKER_CRON.rateLimited,
    ...WORKER_CRON_TAGGED,
  },
};

export function setup() {
  return bootstrapAuth();
}

export default function (ctxs: ReturnType<typeof bootstrapAuth>) {
  const ctx = pickUser(ctxs);
  applyAuth(ctx);
  workerAndCron(ctx);
  sleep(1);
}

export { handleSummary };
