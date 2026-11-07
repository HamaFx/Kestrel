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

// Calendar event card — data-first and scannable at a glance.
//
// [USD] · United States · 14:30 EST · in 4h 22m
// Big title (clamped 2)
// actual 0.3 · forecast 0.2 · prev 0.2
// [Ask AI] [Remind me]
//
// A left accent ribbon encodes importance (red high, amber medium, none low).

import type { EconomicEvent } from '@kestrel/shared';
import { IconBell, IconBolt } from '@tabler/icons-react';
import { Link } from 'next-view-transitions';
import { useState } from 'react';
import { toast } from 'sonner';

import { useTime } from '@/components/providers/time-provider';
import { formatCountdown } from '@/lib/formatters/datetime';
import { cn } from '@/lib/formatters/cn';

const IMPORTANCE = {
  high: { ribbon: 'var(--color-danger)', label: 'High impact', glyph: '▲' },
  medium: { ribbon: 'var(--color-warn)', label: 'Medium impact', glyph: '■' },
  low: { ribbon: 'transparent', label: 'Low impact', glyph: '•' },
} as const satisfies Record<
  EconomicEvent['importance'],
  { ribbon: string; label: string; glyph: string }
>;

type EventImportance = (typeof IMPORTANCE)[EconomicEvent['importance']];

function timeLabel(d: Date): string {
  return d.toLocaleString(undefined, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function Countdown({ ms, imminent }: { ms: number; imminent: boolean }) {
  return (
    <span
      className={cn('font-semibold', ms <= 0 ? 'text-danger' : imminent ? 'text-warn' : 'text-fg')}
    >
      {formatCountdown(ms)}
    </span>
  );
}

function ImpactBadge({
  importance,
  children,
}: {
  importance: EventImportance;
  children: React.ReactNode;
}) {
  return (
    <span
      className="text-fg font-bold uppercase tabular-nums"
      title={importance.label}
      aria-label={importance.label}
    >
      <span aria-hidden className="mr-1">
        {importance.glyph}
      </span>
      {children}
    </span>
  );
}

function Stat({
  label,
  value,
  unit,
  emphasis,
}: {
  label: string;
  value: number;
  unit: string | null;
  emphasis?: boolean;
}) {
  return (
    <span className="flex items-baseline gap-1">
      <dt className="text-fg-subtle text-caption tracking-wide uppercase">{label}</dt>
      <dd className={cn('font-semibold', emphasis ? 'text-fg' : 'text-fg-muted')}>
        {value}
        {unit ? <span className="text-fg-subtle ml-0.5 font-normal">{unit}</span> : null}
      </dd>
    </span>
  );
}

function beatMiss(event: EconomicEvent): 'beat' | 'miss' | null {
  if (event.actual === null || event.forecast === null) return null;
  const delta = event.actual - event.forecast;
  if (delta === 0) return null;
  const isSignificant =
    event.forecast !== 0
      ? Math.abs(delta) / Math.abs(event.forecast) > 0.01
      : Math.abs(delta) > 0.01;
  if (!isSignificant) return null;
  return delta > 0 ? 'beat' : 'miss';
}

function DataRow({ event }: { event: EconomicEvent }) {
  const beat = beatMiss(event);
  return (
    <dl className="surface-well bg-bg/60 border-edge/40 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-md border p-2 font-mono text-xs tabular-nums sm:text-sm">
      {event.actual !== null && (
        <Stat label="actual" value={event.actual} unit={event.unit} emphasis />
      )}
      {event.forecast !== null && (
        <Stat label="forecast" value={event.forecast} unit={event.unit} />
      )}
      {event.previous !== null && <Stat label="prev" value={event.previous} unit={event.unit} />}
      {beat ? (
        <span
          className={cn(
            'text-caption ml-auto inline-flex items-center gap-1 px-1.5 font-bold uppercase tabular-nums',
            beat === 'beat' ? 'text-bull' : 'text-bear',
          )}
        >
          {beat === 'beat' ? '▲ beat' : '▼ miss'}
        </span>
      ) : null}
    </dl>
  );
}

const reminderSet = new Set<string>();

function EventActions({ event }: { event: EconomicEvent }) {
  const askPrompt = encodeURIComponent(
    `What does ${event.title} (${event.currency ?? event.country}) at ${new Date(event.date).toUTCString()} usually mean for ${event.currency ?? 'USD'} and gold?`,
  );

  return (
    <div
      className={cn(
        'border-border/70 flex items-center justify-between gap-2 border-t px-3.5 py-2',
        'bg-bg-elev-1/60 transition-colors duration-150',
        'hover:bg-bg-elev-2/60',
      )}
    >
      <Link
        href={`/chat?prompt=${askPrompt}`}
        className="surface-chip bg-bg-elev-2 text-fg-muted hover:text-fg tactile-press border-edge/60 inline-flex min-h-10 items-center gap-1.5 rounded-md border px-3.5 py-2 text-xs font-medium shadow-xs transition-all active:translate-y-[0.5px]"
      >
        <IconBolt className="size-3.5" />
        Ask AI
      </Link>
      <RemindButton event={event} />
    </div>
  );
}

function RemindButton({ event }: { event: EconomicEvent }) {
  const [armed, setArmed] = useState(() => reminderSet.has(`cal-${event.id}`));

  async function arm() {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      toast.error('Notifications unsupported on this device');
      return;
    }
    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }
    if (permission !== 'granted') {
      toast.error('Notifications denied', {
        description: 'Enable notifications in your browser settings to set reminders.',
      });
      return;
    }

    const fireAt = event.date - 5 * 60_000;
    const ms = fireAt - Date.now();
    if (ms <= 0) {
      toast.error('Too close to the event for a 5-minute reminder');
      return;
    }
    setArmed(true);
    reminderSet.add(`cal-${event.id}`);
    toast.success('Reminder set', {
      description: `5 minutes before ${event.title}`,
    });
    window.setTimeout(() => {
      try {
        new Notification(event.title, {
          body: `${event.country} · ${timeLabel(new Date(event.date))} — in 5 minutes`,
          icon: '/icons/icon-192.png',
          tag: `cal-${event.id}`,
        });
      } catch {
        /* tab gone */
      }
    }, ms);
  }

  return (
    <button
      type="button"
      onClick={arm}
      disabled={armed}
      aria-pressed={armed}
      className={cn(
        'text-body-sm tactile-press pointer-events-auto inline-flex min-h-10 items-center gap-1.5 rounded-md px-3.5 py-2 font-medium transition-colors active:translate-y-[0.5px]',
        armed ? 'text-fg bg-bg-elev-2' : 'text-fg-muted hover:text-fg bg-bg-elev-2',
      )}
    >
      <IconBell className={cn('size-3.5', armed && 'fill-current')} />
      {armed ? 'Reminded' : 'Remind me'}
    </button>
  );
}

export function EventCard({ event }: { event: EconomicEvent }) {
  const { now } = useTime();
  const date = new Date(event.date);
  const importance = IMPORTANCE[event.importance];
  const isFuture = event.date > now;
  const isImminent = isFuture && event.date - now < 60 * 60_000;
  const hasRibbon = event.importance !== 'low';

  return (
    <article
      className={cn(
        'group relative overflow-hidden rounded-xl border border-white/[0.07] bg-[#131416]',
        'transition-colors duration-200 md:hover:border-white/[0.15] md:hover:bg-[#161719]',
        isImminent && 'border-warn/50',
      )}
    >
      {hasRibbon ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-1"
          style={{ backgroundColor: importance.ribbon }}
        />
      ) : null}

      <div className={cn('flex flex-col gap-2 p-3.5 sm:p-4', hasRibbon && 'pl-4 sm:pl-5')}>
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

        <h3 className="text-fg line-clamp-2 font-sans text-sm leading-snug font-semibold sm:text-base">
          {event.title}
        </h3>

        {(event.actual !== null || event.forecast !== null || event.previous !== null) && (
          <DataRow event={event} />
        )}
      </div>

      {isFuture ? <EventActions event={event} /> : null}
    </article>
  );
}
