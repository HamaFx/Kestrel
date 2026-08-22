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

// Custom k6 metrics used across all load tests.
import { Counter, Rate, Trend } from 'k6/metrics';

/** Share of all requests that returned HTTP 429 (rate-limited). */
export const rateLimited = new Rate('rate_limited');

/** Time-to-first-token for /api/chat SSE streams (ms). Only recorded
 *  when the test actually measures TTFB — currently a placeholder for
 *  the xk6-sse stretch goal. */
export const chatTtfb = new Trend('chat_ttfb', true);

/** Total stream bytes received from /api/chat responses. */
export const chatStreamBytes = new Counter('chat_stream_bytes');

/** Count of failed authentications (401/403). */
export const authFailures = new Counter('auth_failures');
