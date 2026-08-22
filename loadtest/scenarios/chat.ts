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

// Per-iteration VU function: POST /api/chat with a simple prompt.
// Guarded by K6_ENABLE_CHAT=true to prevent accidental LLM cost.
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';
import { sleep } from 'k6';

import type { SessionCtx } from '../config/environments.js';
import { record429 } from '../lib/checks.js';
import { postJson } from '../lib/http.js';
import { chatStreamBytes } from '../lib/metrics.js';

export function chatTurn(ctx: SessionCtx): void {
  // Guard: skip if no threadId is available for this user
  if (!ctx.threadId) {
    return;
  }

  const messageId = uuidv4();

  const body = {
    threadId: ctx.threadId,
    messages: [
      {
        id: messageId,
        role: 'user',
        content: 'What is XAUUSD doing today? Give a brief summary.',
        parts: [],
      },
    ],
  };

  const res = postJson('/api/chat', 'chat', body);

  // Record stream bytes for bandwidth profiling
  const bodyStr = res.body as string;
  if (typeof bodyStr === 'string') {
    chatStreamBytes.add(bodyStr.length);
  }

  // Record 429s explicitly for chat (the limiter is 30/min/user)
  record429(res);

  // Think-time between chat turns — this user won't post again for a while
  sleep(5 + Math.random() * 10);
}
