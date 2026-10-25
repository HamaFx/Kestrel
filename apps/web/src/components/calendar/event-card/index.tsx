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

// IconCalendar event card — data-first, scannable at a glance.
//
// Layout:
//
//   ┌────────────────────────────────────────┐
//   │ [USD] · United States · 14:30 EST      │  meta strip (currency + country + time)
//   │         in 4h 22m                       │  countdown (future) or "released" (past)
//   │                                         │
//   │ Big title (clamped 2)                   │  text-body, semibold
//   │                                         │
//   │ actual 0.3 · forecast 0.2 · prev 0.2    │  data row (only when present)
//   │                                         │
//   │              [Ask AI]  [Remind me]      │  action row
//   └────────────────────────────────────────┘
//
// Vertical accent ribbon on the left encodes importance: red = high,
// amber = medium, low = no ribbon (only shown when paired with a
// contrasting surface tone). Same scannability cue as the news cards.
//
// Per PLAN.md §2.4 + §2.6 — sharpen radii, adopt R1 typography tokens,
// kill the ring-1 chip pattern, surface-align with ArticleCard refactor
// (commit 1992755) so news and calendar read as one design system.
import type { EconomicEvent } from '@kestrel/shared';

import { useTime } from '@/components/providers/time-provider';
import { cn } from '@/lib/formatters/cn';

import { Countdown } from './countdown';
import { EventActions } from './event-actions';
import { DataRow } from './event-data-row';
import { IMPORTANCE } from './event-importance';
import { timeLabel } from './event-time';
import { ImpactBadge } from './impact-badge';

interface EventCardProps {
  event: EconomicEvent;
}

export function EventCard({ event }: EventCardProps) {
  const { now } = useTime();
  const date = new Date(event.date);
  const importance = IMPORTANCE[event.importance];
  const isFuture = event.date > now;
  const isImminent = isFuture && event.date - now < 60 * 60_000;
  const hasRibbon = event.importance !== 'low';

  return (
    <article
      className={cn(
        'group relative overflow-hidden rounded-xl',
        'border-border/80 bg-bg-elev-1 surface-chip border shadow-[var(--shadow-chip)]',
        'md:hover:bg-bg-elev-2/80 transition-all duration-200',
        isImminent && 'border-warn/50 shadow-[0_0_16px_rgba(217,143,0,0.15)]',
      )}
    >
      {/* Importance ribbon — suppressed for low-importance events; the
       * subdued bg-elev-1 surface already conveys "less prominent". */}
      {hasRibbon ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-1"
          style={{ backgroundColor: importance.ribbon }}
        />
      ) : null}

      <div className={cn('flex flex-col gap-2 p-3.5 sm:p-4', hasRibbon && 'pl-4 sm:pl-5')}>
        {/* Meta strip */}
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
          <ImpactBadge importance={importance}>{event.currency ?? event.country}</ImpactBadge>
          <span aria-hidden className="text-fg-subtle opacity-50">
            ·
          </span>
          <span className="text-fg-muted">{event.country}</span>
          <span aria-hidden className="text-fg-subtle opacity-50">
            ·
          </span>
          <time dateTime={date.toISOString()} className="text-fg-muted">
            {timeLabel(date)}
          </time>
          {isFuture ? (
            <>
              <span aria-hidden="true" className="text-fg-subtle opacity-50">
                ·
              </span>
              <Countdown ms={event.date - now} imminent={isImminent} />
            </>
          ) : event.actual !== null ? (
            <>
              <span aria-hidden="true" className="text-fg-subtle opacity-50">
                ·
              </span>
              <span className="text-fg-subtle">released</span>
            </>
          ) : null}
        </div>

        {/* Title */}
        <h3 className="text-fg line-clamp-2 font-sans text-sm leading-snug font-semibold sm:text-base">
          {event.title}
        </h3>

        {/* Data row — actual / forecast / previous + beat/miss */}
        {(event.actual !== null || event.forecast !== null || event.previous !== null) && (
          <DataRow event={event} />
        )}
      </div>

      {/* Actions stay in normal flow so they can never cover the event title
       * or data. They fade in on pointer hover and remain visible on touch. */}
      {isFuture ? <EventActions event={event} /> : null}
    </article>
  );
}
