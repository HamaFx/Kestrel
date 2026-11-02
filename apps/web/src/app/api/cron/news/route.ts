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

// GET /api/cron/news — pulls latest from Marketaux + Finnhub, upserts
// news_articles, dedupes by sha1(url). Embeddings are intentionally NOT
// computed here so a news-fetch failure doesn't block the embedding
// cron, and vice versa.
//
// The backfill loop and its high-water mark live in `@/lib/services/news`, so
// the manual fallback and the worker job share one implementation.

import { withCronAuth } from '@/lib/http/cron';
import { createScopedLoggerWithContext } from '@/lib/logger';
import { refreshNewsService } from '@/lib/services/news';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 60 s is the Hobby cap; we expect <10 s in practice.
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  const log = createScopedLoggerWithContext({ component: 'cron', job: 'news' });
  return withCronAuth(
    req,
    async () => refreshNewsService(log),
    // Audit 2026-10-31 (R4): the News page's Refresh button calls this route
    // from a normal user session, so it opts into any-session access and
    // carries its own per-user limit to protect the shared provider quota.
    { session: 'any', sessionRateLimit: { group: 'cron_news_refresh', perMinute: 4 } },
  );
}
