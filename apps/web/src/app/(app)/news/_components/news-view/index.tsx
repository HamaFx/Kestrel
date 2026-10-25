'use client';

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

// /news interactive view. Server component fetches the articles, this
// client component owns the filter state, search, time bucketing, and
// the auto-refresh affordance.
//
// Time buckets:
//   - "Last hour"    < 60 min
//   - "Today"        same calendar day in user's tz
//   - "Yesterday"    previous calendar day
//   - "This week"    rest of current ISO week
//   - "Older"        everything else
//
// Each bucket renders as a sticky-headed section so scrolling preserves
// the "where am I in the timeline" cue.
import type { NewsArticle } from '@kestrel/shared';

import { NewsToolbar } from '../news-toolbar';
import { NewsFeed } from './news-feed';
import { NewsFilterRow } from './news-filter-row';
import { useNewsView } from './use-news-view';

interface NewsViewProps {
  initialArticles: NewsArticle[];
}

export function NewsView({ initialArticles }: NewsViewProps) {
  const controller = useNewsView({ initialArticles });
  const {
    queryInput,
    setQueryInput,
    sentiment,
    setSentiment,
    symbol,
    setSymbol,
    symbolOptions,
    savedOnly,
    setSavedOnly,
    savedCount,
    pending,
    lastRefreshed,
    manualRefresh,
    allArticles,
    filtered,
    buckets,
    sentinelRef,
    isFetchingNextPage,
    hasNextPage,
  } = controller;

  return (
    <div className="flex flex-col gap-4">
      <NewsToolbar
        query={queryInput}
        onQuery={setQueryInput}
        sentiment={sentiment}
        onSentiment={setSentiment}
        symbol={symbol}
        onSymbol={setSymbol}
        symbolOptions={symbolOptions}
        visibleCount={filtered.length}
        totalCount={allArticles.length}
      />

      {/* Saved-only toggle + manual refresh row */}
      <NewsFilterRow
        savedOnly={savedOnly}
        onToggleSaved={() => setSavedOnly((v) => !v)}
        savedCount={savedCount}
        pending={pending}
        lastRefreshed={lastRefreshed}
        onRefresh={manualRefresh}
      />

      {/* Content */}
      <NewsFeed
        buckets={buckets}
        savedOnly={savedOnly}
        totalCount={allArticles.length}
        isFetchingNextPage={isFetchingNextPage}
        hasNextPage={hasNextPage}
        sentinelRef={sentinelRef}
      />
    </div>
  );
}
