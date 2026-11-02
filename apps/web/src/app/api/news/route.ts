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

import { errorResponse, withAuth } from '@/lib/http/api';
import { listNewsPageService } from '@/lib/services/news';
import { rateLimitedResponse, withRateLimit } from '@/lib/services/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NEWS_RATE_LIMIT = Number(process.env.NEWS_RATE_LIMIT) || 60;

// The compose()/authMiddleware chain never attached the authenticated user to
// the handler context, so `ctx.user` was undefined and every read 500'd
// (uncovered until the k6 smoke hit the route). Use the standard withAuth
// wrapper the rest of the API surface uses.
export const GET = withAuth<void>(async (req, { user }) => {
  try {
    // RL-5: per-user rate limit on news reads.
    const rl = await withRateLimit(user.userId, 'news_read', NEWS_RATE_LIMIT);
    if (!rl.allowed) {
      return rateLimitedResponse(rl);
    }

    const url = new URL(req.url);
    const page = await listNewsPageService({
      offset: url.searchParams.get('offset'),
      limit: url.searchParams.get('limit'),
      sentiment: url.searchParams.get('sentiment'),
      symbol: url.searchParams.get('symbol'),
      query: url.searchParams.get('q'),
    });

    return Response.json(page);
  } catch (err) {
    return errorResponse(err, req);
  }
});
