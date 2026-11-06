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

// Marketaux REST client. Fetches news_articles candidates we then dedupe
// + map to our internal NewsArticle DTO.
//
// Reference: https://www.marketaux.com/documentation
//
// We use `/v1/news/all` with a search string that targets our scope:
// XAU/gold, the three FX pairs, and the macro keywords most likely to move
// them. The free tier is 100 reqs/day so the cron stays at 5-minute cadence
// (~288 calls/day) only if you're on a paid plan; the cron is rate-aware
// (self-throttle in cache/throttle.ts) and degrades gracefully on hitting it.

import { z } from 'zod';

import type { ThrottleConfig } from '../../cache/throttle';
import { providerFetchJson } from '../http';

const PROVIDER = 'marketaux';
const BASE_URL = 'https://api.marketaux.com';
const DEFAULT_TIMEOUT_MS = 10_000;

// Free tier ~ 100 calls/day; we cap ourselves at 4/min so a quick burst
// (e.g. backfill) doesn't exhaust the budget in seconds.
const THROTTLE: ThrottleConfig = { limit: 4, windowMs: 60_000 };

/** Default keyword set covering everything we care about. */
export const DEFAULT_SEARCH =
  'XAU OR gold OR "EUR/USD" OR EURUSD OR "GBP/USD" OR GBPUSD OR Fed OR FOMC OR ECB OR BoE OR NFP OR "non-farm" OR CPI OR PCE';

const EntitySchema = z.looseObject({
  symbol: z.string().optional(),
  name: z.string().optional(),
  type: z.string().optional(),
  industry: z.string().optional(),
  match_score: z.number().optional(),
  sentiment_score: z.number().optional(),
});

const ArticleSchema = z.object({
  uuid: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  snippet: z.string().nullable().optional(),
  url: z.url(),
  source: z.string().optional(),
  published_at: z.string(),
  entities: z.array(EntitySchema).default([]),
});

const ResponseSchema = z.object({
  data: z.array(ArticleSchema),
  meta: z
    .object({
      found: z.number().optional(),
      returned: z.number().optional(),
    })
    .optional(),
});

const ErrorSchema = z.object({
  error: z.object({ code: z.string().optional(), message: z.string() }),
});

export type RawMarketauxArticle = z.infer<typeof ArticleSchema>;

export interface FetchNewsParams {
  apiKey: string;
  /** Override the default search query — used by tests. */
  search?: string;
  /** ISO8601 lower bound (Marketaux uses `published_after`). */
  publishedAfter?: string;
  limit?: number;
  signal?: AbortSignal;
  skipThrottle?: boolean;
}

/** Page through `/v1/news/all` once. Marketaux paginates via `page=`; we
 * keep this single-page since the cron runs frequently and we trust the
 * default sort (published_at desc). */
export async function fetchLatest(params: FetchNewsParams): Promise<RawMarketauxArticle[]> {
  const url = new URL('/v1/news/all', BASE_URL);
  url.searchParams.set('api_token', params.apiKey);
  url.searchParams.set('search', params.search ?? DEFAULT_SEARCH);
  url.searchParams.set('language', 'en');
  url.searchParams.set('limit', String(params.limit ?? 50));
  url.searchParams.set('filter_entities', 'true');
  if (params.publishedAfter) {
    // Marketaux expects YYYY-MM-DDTHH:mm format (no seconds, no Z suffix).
    const trimmed = params.publishedAfter.replace(/:\d{2}(\.\d+)?Z?$/, '').slice(0, 16);
    url.searchParams.set('published_after', trimmed);
  }

  const response = await providerFetchJson({
    provider: PROVIDER,
    url,
    schema: ResponseSchema,
    throttle: THROTTLE,
    ...(params.skipThrottle !== undefined ? { skipThrottle: params.skipThrottle } : {}),
    ...(params.signal ? { signal: params.signal } : {}),
    timeoutMs: DEFAULT_TIMEOUT_MS,
    errorMessage: (json) => {
      const errEnv = ErrorSchema.safeParse(json);
      return errEnv.success ? errEnv.data.error.message : null;
    },
  });
  return response.data;
}
