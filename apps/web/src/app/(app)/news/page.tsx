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

// /news — server-rendered list of recent articles tagged for our scope.
// The page itself is a thin server wrapper: fetch + render the
// SentimentSummary above the interactive <NewsView/> client component.

import { listRecentArticles } from '@kestrel/ai';
import { IconNews } from '@tabler/icons-react';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { BookmarksProvider } from '@/components/news/bookmarks-context';
import { EmptyState } from '@/components/ui/empty-state';

import { NewsView } from './_components/news-view';
import { RefreshButton } from './_components/refresh-button';
import { SentimentSummary } from './_components/sentiment-summary';

export const metadata: Metadata = {
  title: 'News',
  description:
    'Macroeconomic market news, central bank intelligence, and breaking catalyst coverage.',
};
// News is user-scoped database content and must not be fetched during `next build`.
export const dynamic = 'force-dynamic';

export default async function NewsPage() {
  // Larger window now that the page can filter — gives the user real
  // breadth to slice through.
  const articles = await listRecentArticles(120);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="News"
        description="Headlines tagged for XAU / EUR / GBP / USD from our market data feed."
      />

      {articles.length === 0 ? (
        <EmptyState
          tone="muted"
          icon={<IconNews className="size-7" strokeWidth={1.75} />}
          title="No news yet"
          description="Headlines populate automatically every few minutes. Tap below to refresh now."
          action={<RefreshButton endpoint="/api/cron/news" />}
        />
      ) : (
        <BookmarksProvider>
          <SentimentSummary articles={articles} />
          <NewsView initialArticles={articles} />
        </BookmarksProvider>
      )}
    </div>
  );
}
