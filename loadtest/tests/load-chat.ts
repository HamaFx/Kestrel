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

// Chat streaming load test — guarded by K6_ENABLE_CHAT=true.
// Models low-concurrency LLM streaming with generous latency thresholds.
// Requires seeded users with threadIds (Strategy B only).
import { sleep } from 'k6';

import { env } from '../config/environments.js';
import { CHAT, CHAT_TAGGED } from '../config/thresholds.js';
import { applyAuth, bootstrapAuth, pickUser } from '../lib/auth.js';
import { handleSummary } from '../lib/summary.js';
import { chatTurn } from '../scenarios/chat.js';

// Guard: refuse to run unless explicitly enabled.
if (__ENV['K6_ENABLE_CHAT'] !== 'true') {
  throw new Error(
    'chat load test requires K6_ENABLE_CHAT=true. ' +
      'This test makes real LLM calls that cost money.',
  );
}

const VUS = parseInt(__ENV['K6_CHAT_VUS'] ?? '3', 10);
const ITERATIONS = parseInt(__ENV['K6_CHAT_ITERS'] ?? '5', 10);

export const options = {
  scenarios: {
    chat: {
      executor: 'per-vu-iterations',
      vus: VUS,
      iterations: ITERATIONS,
      maxDuration: '5m',
    },
  },
  thresholds: {
    http_req_failed: CHAT.httpReqFailed,
    checks: CHAT.checks,
    rate_limited: CHAT.rateLimited,
    ...CHAT_TAGGED,
  },
};

export function setup() {
  return bootstrapAuth();
}

export default function (ctxs: ReturnType<typeof bootstrapAuth>) {
  const ctx = pickUser(ctxs);
  applyAuth(ctx);
  chatTurn(ctx);
  sleep(2);
}

export { handleSummary };
