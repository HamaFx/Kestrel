// SPDX-License-Identifier: Apache-2.0

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

// Phase 1.6 — Calendar widget.
//
// Next 3 high-impact economic events with live countdowns. Uses the
// shared `useTime` provider so all tickers stay in sync without each
// widget spawning its own interval.
//
// Enhanced with:
// - 1-Click "Ask AI Copilot" pre-event gameplan prompt
// - Automatic background synchronization via React Query
import type { EconomicEvent } from '@kestrel/shared';
import { IconBolt, IconCalendar } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

import { useTime } from '@/components/providers/time-provider';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { apiFetch } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { formatCountdown } from '@/lib/datetime';

interface CalendarWidgetProps {
  events: readonly EconomicEvent[];
  limit?: number;
}

export function CalendarWidget({ events: initialEvents, limit = 3 }: CalendarWidgetProps) {
  const { now } = useTime();

  // Background sync every 60 seconds
  const { data: syncedEvents } = useQuery({
    queryKey: ['dashboard-calendar-events'],
    queryFn: async () => {
      const res = await apiFetch<{ items?: EconomicEvent[]; events?: EconomicEvent[] }>(
        '/api/calendar?limit=10',
      );
      return res.items ?? res.events ?? [];
    },
    initialData: initialEvents as EconomicEvent[],
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const activeList = syncedEvents ?? initialEvents;

  // Filter to upcoming high/medium importance, sort ascending, cap.
  const upcoming = activeList
    .filter((e) => e.date > now)
    .sort((a, b) => a.date - b.date)
    .slice(0, limit);

  return (
    <Card as="section" aria-label="Upcoming events">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconCalendar className="text-fg-subtle size-4" />
          <span className="text-fg text-sm font-semibold">Calendar</span>
        </div>
        <Link href="/calendar" className="text-fg-subtle hover:text-fg text-xs font-medium">
          View all
        </Link>
      </header>

      {upcoming.length === 0 ? (
        <EmptyState
          icon={<IconCalendar className="size-5" />}
          title="No upcoming events"
          description="High-impact events will appear here as they're scheduled."
          tone="muted"
          bare
          className="py-4"
        />
      ) : (
        <ul className="flex flex-col">
          {upcoming.map((e) => {
            const date = new Date(e.date);
            const importanceTone =
              e.importance === 'high'
                ? 'bg-danger/15 text-danger'
                : e.importance === 'medium'
                  ? 'bg-warn/15 text-warn'
                  : 'bg-fg-muted/15 text-fg-muted';

            const aiPrompt = encodeURIComponent(
              `Provide a pre-event volatility and risk gameplan for ${e.title} (${e.currency ?? e.country}). What are key price levels and historical reactions?`,
            );

            return (
              <li
                key={e.id}
                className="border-divider group flex items-center justify-between gap-2 border-b py-2.5 last:border-0"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="text-fg truncate text-sm font-semibold">{e.title}</span>
                  <span className="text-fg-subtle text-xs tabular-nums">
                    {date.toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}{' '}
                    ·{' '}
                    {date.toLocaleTimeString(undefined, {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    · {formatCountdown(e.date - now)}
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <span
                    className={cn(
                      'rounded-sm px-1.5 py-0.5 font-mono text-xs font-bold uppercase',
                      importanceTone,
                    )}
                  >
                    {e.currency ?? e.country}
                  </span>

                  {/* 1-Click Ask AI Copilot */}
                  <Link
                    href={`/chat?prompt=${aiPrompt}`}
                    className="text-fg-subtle hover:text-brand hover:bg-brand/10 inline-flex min-h-[32px] min-w-[32px] items-center justify-center rounded-sm p-1.5 transition-colors"
                    title={`Get AI event gameplan for ${e.title}`}
                    aria-label={`Get AI event gameplan for ${e.title}`}
                  >
                    <IconBolt className="text-brand size-4" />
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
