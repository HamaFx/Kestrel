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

import { computeStats, listEntries } from '@kestrel/ai';
import type { JournalEntry, JournalStats } from '@kestrel/shared';
import type { Metadata } from 'next';

import { auth } from '@/auth';

import { JournalView } from './_components/journal-view';

export const metadata: Metadata = {
  title: 'Journal',
  description: 'Track trade executions, equity growth, R-multiples, and AI post-trade reviews.',
};

export const dynamic = 'force-dynamic';

export default async function JournalPage() {
  let initialData: { entries: JournalEntry[]; stats: JournalStats } | undefined;

  const session = await auth();
  if (session?.user?.id) {
    try {
      const [entries, stats] = await Promise.all([
        listEntries(session.user.id),
        computeStats(session.user.id),
      ]);
      initialData = { entries, stats };
    } catch {
      // Fall back gracefully to client-side hydration if server prefetch fails
    }
  }

  // JournalView owns the single page header (with its own action row) — this
  // route used to stack a second "Trading Journal" banner underneath it.
  return <JournalView initialData={initialData} />;
}
