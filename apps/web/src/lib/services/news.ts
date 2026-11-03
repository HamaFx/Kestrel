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

// News ingestion, page reads, and embedding backfill.
//
// Route handlers are controllers over these functions. The refresh loop and
// its high-water mark live here so the scheduler route, the manual
// `/api/news/refresh` action, and the worker job cannot drift in pagination,
// lookback, or error handling.

import 'server-only';

import {
  backfillEmbeddings,
  countPendingEmbeddings,
  latestArticleTimestampMs,
  listRecentArticles,
  upsertArticles,
} from '@kestrel/ai';
import { fetchNews } from '@kestrel/data';
import { withRateLimit } from '@kestrel/db';

import type { CategorizedLogger } from '@/lib/logger';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/** Furthest we look back when `news_articles` is empty. */
const FALLBACK_LOOKBACK_MS = 6 * 60 * 60 * 1000;

/** Floor on the high-water mark so a bad timestamp cannot scan from 1970. */
const MAX_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

/** Marketaux's free tier returns up to 50 per call. */
const PAGE_LIMIT = 50;

/** Hard ceiling so a misconfigured cron cannot burn the daily quota. */
const MAX_PAGES = 4;

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

/** Most-recent stored article, clamped to the fallback window. */
async function highWaterMarkIso(log: CategorizedLogger): Promise<string> {
  const latestMs = await latestArticleTimestampMs();
  const now = Date.now();
  if (latestMs === null) return new Date(now - FALLBACK_LOOKBACK_MS).toISOString();

  const floor = now - MAX_LOOKBACK_MS;
  const start = Math.max(latestMs + 1, floor);
  if (start > now) {
    log.warn(
      { latestMs, now },
      'stored news timestamp is in the future; using the fallback lookback',
    );
    return new Date(now - FALLBACK_LOOKBACK_MS).toISOString();
  }
  return new Date(start).toISOString();
}

export interface NewsRefreshResult {
  processed: number;
  note: string;
}

/** Fetch every new article since the high-water mark, page by page. */
export async function refreshNewsService(log: CategorizedLogger): Promise<NewsRefreshResult> {
  let publishedAfter = await highWaterMarkIso(log);
  let totalProcessed = 0;
  let totalInserted = 0;
  let totalSkipped = 0;
  let pages = 0;

  try {
    while (pages < MAX_PAGES) {
      const articles = await fetchNews({ publishedAfter, limit: PAGE_LIMIT });
      if (articles.length === 0) break;

      const { inserted, skipped } = await upsertArticles(articles);
      totalProcessed += articles.length;
      totalInserted += inserted;
      totalSkipped += skipped;

      // The upstream does not guarantee sort order, so take the max manually.
      const freshestMs = articles.reduce((acc, article) => Math.max(acc, article.publishedAt), 0);
      if (freshestMs <= 0) break;
      const next = new Date(freshestMs + 1).toISOString();
      if (next === publishedAfter) break;
      publishedAfter = next;
      pages += 1;
    }

    return {
      processed: totalProcessed,
      note: `pages=${pages} inserted=${totalInserted} skipped=${totalSkipped} since=${publishedAfter}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.errorContext(err, 'fetchNews', { message });
    throw new Error(`news fetch failed: ${message}`, { cause: err });
  }
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
