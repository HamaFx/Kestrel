'use client';

// SPDX-License-Identifier: Apache-2.0

// Time-bucketed article list with the infinite-scroll sentinel.
import { IconBookmark } from '@tabler/icons-react';
import type { RefObject } from 'react';

import { ArticleCard } from '@/components/news/article-card';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonCard } from '@/components/ui/skeleton';

import type { Bucket } from './bucket-by-time';

export function NewsFeed({
  buckets,
  savedOnly,
  totalCount,
  isFetchingNextPage,
  hasNextPage,
  sentinelRef,
}: {
  buckets: Bucket[];
  savedOnly: boolean;
  totalCount: number;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  sentinelRef: RefObject<HTMLDivElement | null>;
}) {
  if (buckets.length === 0) {
    return (
      <EmptyState
        tone="muted"
        icon={<IconBookmark className="size-7" strokeWidth={1.75} />}
        title={savedOnly ? 'No saved articles' : 'Nothing matches'}
        description={
          savedOnly
            ? 'Save articles by tapping the bookmark icon on any card.'
            : 'Try clearing the search or pick a different sentiment / symbol filter.'
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {buckets.map(([label, items]) => (
        <section key={label} className="flex flex-col gap-3">
          <h2
            className="bg-bg-elev-1/95 text-fg-subtle text-caption sticky z-10 -mx-4 flex items-baseline gap-2 px-5 py-2 font-semibold tracking-wider uppercase"
            style={{ top: 'calc(var(--topbar-h) + env(safe-area-inset-top))' }}
          >
            {label}
            <span className="text-fg-subtle/60 tabular-nums">{items.length}</span>
          </h2>
          <ul className="flex flex-col gap-3">
            {items.map((a) => (
              <li key={a.id}>
                <ArticleCard article={a} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="flex flex-col gap-3">
        {isFetchingNextPage ? (
          <>
            <SkeletonCard className="h-24" lines={3} />
            <SkeletonCard className="h-24" lines={3} />
            <SkeletonCard className="h-24" lines={3} />
          </>
        ) : totalCount > 0 && !hasNextPage ? (
          <span className="text-fg-muted py-2 text-center text-xs">
            {totalCount} articles loaded
          </span>
        ) : totalCount > 0 ? (
          <span className="text-fg-muted py-2 text-center text-xs">
            {totalCount} articles loaded · scroll for more
          </span>
        ) : null}
      </div>
    </div>
  );
}
