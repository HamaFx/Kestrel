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

// News page reads, the manual refresh action, and embedding backfill.
//
// Route handlers are controllers over these functions. The fetch loop and its
// high-water mark live in `@kestrel/ai/cron` so the scheduler route, the manual
// `/api/news/refresh` action, and the worker job cannot drift in pagination,
// lookback, or error handling.

import 'server-only';

import { backfillEmbeddings, countPendingEmbeddings, listRecentArticles } from '@kestrel/ai';
import { runNewsRefresh, type NewsRefreshResult } from '@kestrel/ai/cron';
import { withRateLimit } from '@kestrel/db';

import type { CategorizedLogger } from '@/lib/logger';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/** Per-user bucket for the news page's refresh button. */
const NEWS_REFRESH_RATE_LIMIT = 4;

/**
 * Rate-limit the user-facing news refresh. Scheduler invocations use the
 * bearer-authenticated `/api/cron/news` route and are not limited here.
 */
export async function checkNewsRefreshRateLimit(userId: string): Promise<{
  allowed: boolean;
  count: number;
  limit: number;
}> {
  const rl = await withRateLimit(userId, 'news_refresh', NEWS_REFRESH_RATE_LIMIT);
  return { allowed: rl.allowed, count: rl.count, limit: rl.limit };
}

export interface NewsPageInput {
  offset?: string | null;
  limit?: string | null;
  sentiment?: string | null;
  symbol?: string | null;
  query?: string | null;
}

export interface NewsPage {
  items: Awaited<ReturnType<typeof listRecentArticles>>;
  hasMore: boolean;
  nextOffset: number;
}

/** Normalize raw query params and return one page of stored articles. */
export async function listNewsPageService(input: NewsPageInput): Promise<NewsPage> {
  const parsedOffset = Number.parseInt(input.offset ?? '0', 10);
  const parsedLimit = Number.parseInt(input.limit ?? String(DEFAULT_PAGE_SIZE), 10);
  const offset = Number.isNaN(parsedOffset) || parsedOffset < 0 ? 0 : parsedOffset;
  const limit =
    Number.isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > MAX_PAGE_SIZE
      ? DEFAULT_PAGE_SIZE
      : parsedLimit;

  const filters: { sentiment?: string; symbol?: string; query?: string } = {};
  if (input.sentiment) filters.sentiment = input.sentiment;
  if (input.symbol) filters.symbol = input.symbol;
  if (input.query) filters.query = input.query;

  // Fetch limit + 1 so `hasMore` does not need a second count query.
  const rows = await listRecentArticles(limit + 1, offset, filters);
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  return { items, hasMore, nextOffset: offset + items.length };
}

/**
 * Fetch every new article since the high-water mark, page by page.
 *
 * The loop lives in `@kestrel/ai/cron` so the worker `news` job, the
 * `/api/cron/news` fallback, and this manual refresh share one implementation
 * (pagination, lookback, and high-water mark included).
 */
export async function refreshNewsService(log: CategorizedLogger): Promise<NewsRefreshResult> {
  return runNewsRefresh({ log });
}

export interface NewsEmbeddingBackfillResult {
  processed: number;
  note: string;
}

/** Embed a bounded batch of unembedded articles. */
export async function backfillNewsEmbeddingsService(
  options: {
    signal?: AbortSignal;
  } = {},
): Promise<NewsEmbeddingBackfillResult> {
  const before = await countPendingEmbeddings();
  const result = await backfillEmbeddings({
    batchSize: 32,
    // Soft cap: at ~100 ms/text on the gateway, 256 fits in under 30 s.
    maxRows: 256,
    ...(options.signal ? { signal: options.signal } : {}),
  });
  const after = await countPendingEmbeddings();
  return {
    processed: result.embedded,
    note: `pending: ${before}->${after}, batches=${result.batches}, tokens=${result.totalTokens}`,
  };
}
