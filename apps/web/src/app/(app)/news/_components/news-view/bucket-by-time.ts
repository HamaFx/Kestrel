// SPDX-License-Identifier: Apache-2.0

// Calendar-day time bucketing for the news feed.

import type { NewsArticle } from '@kestrel/shared';

import { startOfDay, startOfDayOffset } from '@/lib/formatters/datetime';

export type Bucket = readonly [label: string, items: NewsArticle[]];

export function bucketByTime(articles: readonly NewsArticle[]): Bucket[] {
  if (articles.length === 0) return [];
  const now = Date.now();
  const HOUR = 60 * 60_000;

  const today0 = startOfDay(now);
  const yesterday0 = startOfDayOffset(now, -1);
  const weekAgo = startOfDayOffset(now, -6);

  const hour: NewsArticle[] = [];
  const today: NewsArticle[] = [];
  const yesterday: NewsArticle[] = [];
  const week: NewsArticle[] = [];
  const older: NewsArticle[] = [];

  for (const a of articles) {
    if (now - a.publishedAt < HOUR) hour.push(a);
    else if (a.publishedAt >= today0) today.push(a);
    else if (a.publishedAt >= yesterday0) yesterday.push(a);
    else if (a.publishedAt >= weekAgo) week.push(a);
    else older.push(a);
  }

  const buckets: Bucket[] = [];
  if (hour.length) buckets.push(['Last hour', hour]);
  if (today.length) buckets.push(['Today', today]);
  if (yesterday.length) buckets.push(['Yesterday', yesterday]);
  if (week.length) buckets.push(['This week', week]);
  if (older.length) buckets.push(['Older', older]);
  return buckets;
}
