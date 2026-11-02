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

// SPDX-License-Identifier: Apache-2.0

// Rate-limit service boundary.
//
// `withRateLimit` is used by route handlers across every domain and by the
// domain services that own a bounded operation (market reads, alert previews,
// bulk key tests). Keeping the contract and the 429 envelope in one place
// prevents each route from re-declaring the response shape.

import 'server-only';

export { withRateLimit } from '@kestrel/db';

const RATE_LIMIT_RETRY_AFTER_SECONDS = 60;

export interface RateLimitDecision {
  allowed: boolean;
  count: number;
  limit: number;
}

/** Build the canonical per-user rate-limit response. */
export function rateLimitedResponse(result: Pick<RateLimitDecision, 'count' | 'limit'>): Response {
  return Response.json(
    {
      error: {
        code: 'RATE_LIMITED',
        message: `Too many requests (${result.count}/${result.limit} per minute).`,
      },
    },
    {
      status: 429,
      headers: { 'Retry-After': String(RATE_LIMIT_RETRY_AFTER_SECONDS) },
    },
  );
}
