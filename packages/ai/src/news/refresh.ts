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

// News ingestion (Marketaux + Finnhub → news_articles).
//
// The backfill loop and its high-water mark live here so the worker job, the
// `/api/cron/news` fallback, and the manual `/api/news/refresh` action share
// one implementation. Embeddings are intentionally NOT computed here, so a
// news-fetch failure cannot block the embedding backfill and vice versa.

import { fetchNews } from '@kestrel/data';

import { latestArticleTimestampMs, upsertArticles } from '../persistence/news';
import type { CronRunOptions } from '../runtime/cron-runner';

/** Furthest we look back when `news_articles` is empty. */
const FALLBACK_LOOKBACK_MS = 6 * 60 * 60 * 1000;

/** Floor on the high-water mark so a bad timestamp cannot scan from 1970. */
const MAX_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

/** Marketaux's free tier returns up to 50 per call. */
const PAGE_LIMIT = 50;

/** Hard ceiling so a misconfigured cron cannot burn the daily quota. */
const MAX_PAGES = 4;

export interface NewsRefreshResult {
  processed: number;
  note: string;
}

/** Most-recent stored article, clamped to the fallback window. */
async function highWaterMarkIso(options: CronRunOptions): Promise<string> {
  const latestMs = await latestArticleTimestampMs();
  const now = Date.now();
  if (latestMs === null) return new Date(now - FALLBACK_LOOKBACK_MS).toISOString();

  const floor = now - MAX_LOOKBACK_MS;
  const start = Math.max(latestMs + 1, floor);
  if (start > now) {
    options.log?.warn('stored news timestamp is in the future; using the fallback lookback', {
      latestMs,
      now,
    });
    return new Date(now - FALLBACK_LOOKBACK_MS).toISOString();
  }
  return new Date(start).toISOString();
}

/** Fetch every new article since the high-water mark, page by page. */
export async function runNewsRefresh(options: CronRunOptions = {}): Promise<NewsRefreshResult> {
  let publishedAfter = await highWaterMarkIso(options);
  let totalProcessed = 0;
  let totalInserted = 0;
  let totalSkipped = 0;
  let pages = 0;

  try {
    while (pages < MAX_PAGES) {
      if (options.signal?.aborted) break;
      const articles = await fetchNews({
        publishedAfter,
        limit: PAGE_LIMIT,
        ...(options.signal ? { signal: options.signal } : {}),
      });
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
    options.log?.warn('news fetch failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    throw new Error(`news fetch failed: ${err instanceof Error ? err.message : String(err)}`, {
      cause: err,
    });
  }
}
