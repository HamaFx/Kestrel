'use client';

// SPDX-License-Identifier: Apache-2.0

// Filter/search/refresh state for the news view: debounced query, infinite
// article query, saved-only filter, and the auto/manual refresh affordances.
import type { NewsArticle, SymbolOrCurrencyTag } from '@kestrel/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { parseAsString, parseAsStringLiteral, useQueryState } from 'nuqs';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { useBookmarks } from '@/components/news/use-bookmarks';
import { apiFetch } from '@/lib/http/api-client';

import { bucketByTime } from './bucket-by-time';

const AUTO_REFRESH_MS = 5 * 60_000;
const SEARCH_DEBOUNCE_MS = 300;

const SENTIMENT_VALUES = ['all', 'positive', 'negative', 'neutral'] as const;
const sentimentParser = parseAsStringLiteral(SENTIMENT_VALUES).withDefault('all');
const symbolParser = parseAsString.withDefault('all');
const queryParser = parseAsString.withDefault('');

export function useNewsView({ initialArticles }: { initialArticles: NewsArticle[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useQueryState('q', queryParser);
  const [queryInput, setQueryInput] = useState(query);
  const [sentiment, setSentiment] = useQueryState('sentiment', sentimentParser);
  const [symbol, setSymbol] = useQueryState('symbol', symbolParser);
  const [savedOnly, setSavedOnly] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(Date.now());
  const { count: savedCount, list: savedIds } = useBookmarks();

  // Debounce search input before updating query param (avoids refetch on every keystroke)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (queryInput !== query) {
        setQuery(queryInput || null);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [queryInput, query, setQuery]);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['news', { sentiment, symbol, query }] as const,
    queryFn: async ({ pageParam = 0 }) => {
      const params = new URLSearchParams();
      params.set('offset', String(pageParam));
      params.set('limit', '20');
      if (sentiment && sentiment !== 'all') params.set('sentiment', sentiment);
      if (symbol && symbol !== 'all') params.set('symbol', symbol);
      if (query) params.set('q', query);

      return apiFetch<{ items: NewsArticle[]; hasMore: boolean; nextOffset: number }>(
        `/api/news?${params.toString()}`,
      );
    },
    getNextPageParam: (last: { hasMore: boolean; nextOffset: number }) =>
      last.hasMore ? last.nextOffset : undefined,
    initialPageParam: 0,
    ...(sentiment === 'all' && symbol === 'all' && !query
      ? {
          initialData: {
            pages: [
              {
                items: initialArticles,
                hasMore: initialArticles.length >= 120,
                nextOffset: initialArticles.length,
              },
            ],
            pageParams: [0],
          },
        }
      : {}),
  });

  const allArticles = useMemo(() => {
    if (!data) return initialArticles;
    return data.pages.flatMap((page) => page.items);
  }, [data, initialArticles]);

  // Auto-refresh every 5 minutes (the cron usually runs faster than this
  // upstream, but a soft visual heartbeat keeps the page feeling alive).
  useEffect(() => {
    const id = setInterval(() => {
      startTransition(() => {
        router.refresh();
        setLastRefreshed(Date.now());
      });
    }, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [router]);

  function manualRefresh() {
    startTransition(async () => {
      try {
        await apiFetch('/api/cron/news');
        toast.success('News refreshed');
        router.refresh();
        setLastRefreshed(Date.now());
      } catch (err) {
        toast.error('Refresh failed', {
          description: err instanceof Error ? err.message : 'Network error',
        });
      }
    });
  }

  // Distinct tags actually present in the loaded set, sorted by frequency.
  const symbolOptions = useMemo(() => {
    const counts = new Map<SymbolOrCurrencyTag, number>();
    for (const a of allArticles) {
      for (const s of a.symbols) {
        counts.set(s, (counts.get(s) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
  }, [allArticles]);

  const filtered = useMemo(() => {
    const savedSet = new Set(savedIds);
    return allArticles.filter((a) => {
      if (savedOnly && !savedSet.has(a.id)) return false;
      return true;
    });
  }, [allArticles, savedOnly, savedIds]);

  const buckets = useMemo(() => bucketByTime(filtered), [filtered]);

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  return {
    // filters
    queryInput,
    setQueryInput,
    sentiment,
    setSentiment,
    symbol,
    setSymbol,
    symbolOptions,
    // refresh affordances
    savedOnly,
    setSavedOnly,
    savedCount,
    pending,
    lastRefreshed,
    manualRefresh,
    // feed
    allArticles,
    filtered,
    buckets,
    sentinelRef,
    isFetchingNextPage,
    hasNextPage,
  };
}

export type NewsViewController = ReturnType<typeof useNewsView>;
