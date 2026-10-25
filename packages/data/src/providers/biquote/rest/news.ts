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

// Market news endpoint (`GET /api/news/market`).

import { BiquoteNewsArticleSchema, type BiquoteNewsArticle } from '@kestrel/shared';
import { z } from 'zod';

import { call, type CallOptions } from './call';

const NewsArraySchema = z.array(BiquoteNewsArticleSchema);

export interface FetchBiquoteNewsArgs extends CallOptions {
  symbol?: string;
  language?: string;
  country?: string;
  /** Max articles (1..50, default 25). */
  maxResults?: number;
}

/**
 * Fetch symbol or general market news from BiQuote (`GET /api/news/market`).
 */
export async function fetchMarketNews(
  args: FetchBiquoteNewsArgs = {},
): Promise<BiquoteNewsArticle[]> {
  const maxResults = args.maxResults ? Math.max(1, Math.min(args.maxResults, 50)) : 25;
  return call(
    '/api/news/market',
    {
      maxResults: String(maxResults),
      ...(args.symbol ? { symbol: args.symbol } : {}),
      ...(args.language ? { language: args.language } : {}),
      ...(args.country ? { country: args.country } : {}),
    },
    NewsArraySchema,
    args,
  );
}
