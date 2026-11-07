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

// CalendarHero — countdown-to-next-high-impact + this-week pulse strip.
//
// Sits at the top of /calendar. The countdown is the most actionable
// piece of info on the page: "FOMC in 4h 22m" tells the user whether to
// stay flat for a few hours or whether they have all day. The pulse
// strip shows the distribution of upcoming impacts so the user can
// gauge how event-heavy the week is.
import type { EconomicEvent } from '@kestrel/shared';
import { IconBolt, IconClock } from '@tabler/icons-react';
import { Link } from 'next-view-transitions';

import { BlueprintPlate } from '@/components/brand/blueprint-plates';
import { useTime } from '@/components/providers/time-provider';
import { cn } from '@/lib/formatters/cn';
import { startOfDay, startOfDayOffset } from '@/lib/formatters/datetime';

interface CalendarHeroProps {
  events?: readonly EconomicEvent[];
}

export function CalendarHero({ events = [] }: CalendarHeroProps) {
  const { now } = useTime();

  // Next high-impact event in the future.
  const nextHigh = events
    .filter((e) => e.importance === 'high' && e.date > now)
    .sort((a, b) => a.date - b.date)[0];

  // Upcoming distribution — only future events, capped at 14 days.
  const upcoming = events.filter((e) => e.date > now && e.date - now < 14 * 24 * 60 * 60_000);
  const counts = {
    high: upcoming.filter((e) => e.importance === 'high').length,
    medium: upcoming.filter((e) => e.importance === 'medium').length,
    low: upcoming.filter((e) => e.importance === 'low').length,
  };
  const total = counts.high + counts.medium + counts.low || 1;
  const pct = (n: number) => (n / total) * 100;

  // Today's events — counted from local-day start.
  const today0 = startOfDay(now);
  const todayEnd = startOfDayOffset(now, 1);
  const todayCount = events.filter((e) => e.date >= today0 && e.date < todayEnd).length;

  return (
    <section
      aria-label="Calendar overview"
      className="border-border/80 bg-bg-elev-1 surface-chip border-edge/80 relative flex flex-col gap-4 overflow-hidden rounded-xl border p-4 shadow-[var(--shadow-chip)] sm:p-5"
    >
      {/* Sentinel Eclipse Watch & Meridian Obelisk 3-Layer Sovereign Header Plate */}
      <BlueprintPlate
        id="eclipse"
        variant="compact"
        showRasterBackup
        showAsciiStrip
        className="h-28 w-full sm:h-32"
      />

      {/* Countdown row */}
      {nextHigh ? (
        <div className="flex items-start gap-3.5">
          <span
            aria-hidden="true"
            className="text-danger bg-danger/10 surface-chip border-danger/30 inline-flex size-12 shrink-0 items-center justify-center rounded-xl border shadow-xs"
          >
            <IconBolt className="size-5" strokeWidth={2} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="text-fg-subtle text-caption font-mono font-semibold tracking-wider uppercase">
              Next high-impact
            </p>
            <p className="text-fg truncate font-sans text-base font-bold">{nextHigh.title}</p>
            <p className="text-fg-muted flex items-center gap-1.5 font-mono text-xs tabular-nums">
              <IconClock className="size-3" />
              <Countdown ms={nextHigh.date - now} />
              <span aria-hidden className="opacity-50">
                ·
              </span>
              <CountryChip country={nextHigh.country} currency={nextHigh.currency} />
            </p>
          </div>
          <Link
            href={`/chat?prompt=${encodeURIComponent(
              `What does ${nextHigh.title} mean for ${nextHigh.currency ?? 'the dollar'} and gold?`,
            )}`}
            className="text-fg-muted hover:text-fg surface-chip bg-bg-elev-2 border-edge/60 inline-flex size-9 shrink-0 items-center justify-center rounded-lg border shadow-xs transition-all active:translate-y-[0.5px]"
            aria-label="Ask AI about this event"
          >
            <IconBolt className="size-4" />
          </Link>
        </div>
      ) : (
        <div className="text-fg-muted flex items-center gap-3 text-sm">
          <IconBolt className="text-fg-subtle size-5" />
          No high-impact events in the next 14 days.
        </div>
      )}

      {/* 24-hour UTC Killzone Horizon */}
      <KillzoneHorizonTimeline events={events} now={now} />

      {/* Distribution bar — shows the impact mix for the next two weeks */}
      <div className="flex flex-col gap-2">
        <div className="text-fg-subtle text-body-sm flex items-baseline justify-between">
          <span className="font-semibold tracking-wider uppercase">Next 14 days</span>
          <span className="tabular-nums">
            {todayCount > 0 ? `${todayCount} today · ` : ''}
            {upcoming.length} upcoming
          </span>
        </div>
        <div className="bg-bg-elev-2 flex h-1.5 w-full overflow-hidden rounded-sm">
          {counts.high > 0 ? (
            <span
              aria-hidden
              className="bg-danger h-full"
              style={{ width: `${pct(counts.high)}%` }}
            />
          ) : null}
          {counts.medium > 0 ? (
            <span
              aria-hidden
              className="bg-warn h-full"
              style={{ width: `${pct(counts.medium)}%` }}
            />
          ) : null}
          {counts.low > 0 ? (
            <span
              aria-hidden
              className="bg-fg-subtle h-full"
              style={{ width: `${pct(counts.low)}%`, opacity: 0.5 }}
            />
          ) : null}
        </div>
        <ul className="text-body-sm flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums">
          <Tag dot="bg-danger" tone="text-danger" label="High" count={counts.high} />
          <Tag dot="bg-warn" tone="text-warn" label="Medium" count={counts.medium} />
          <Tag dot="bg-fg-subtle" tone="text-fg-muted" label="Low" count={counts.low} />
        </ul>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

const SESSION_BANDS = [
  {
    label: 'ASIA',
    left: '0%',
    width: '37.5%',
    className: 'bg-info/[0.06] border-r border-info/20',
  },
  {
    label: 'LON',
    left: '29.17%',
    width: '37.5%',
    className: 'bg-white/[0.03] border-x border-white/10',
  },
  { label: 'NY', left: '50%', width: '37.5%', className: 'bg-bull/[0.05] border-r border-bull/20' },
] as const;

function KillzoneHorizonTimeline({
  events,
  now,
}: {
  events: readonly EconomicEvent[];
  now: number;
}) {
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const startMs = dayStart.getTime();
  const todayEvents = events.filter(
    (event) => event.date >= startMs && event.date < startMs + 86_400_000,
  );
  const utcDate = new Date(now);
  const nowPct = ((utcDate.getUTCHours() * 60 + utcDate.getUTCMinutes()) / 1440) * 100;
  const utcLabel = `${utcDate.toISOString().slice(11, 16)} UTC`;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-fg-subtle font-mono text-[9px] font-semibold tracking-[0.14em] uppercase">
          24h UTC Killzone Horizon
        </span>
        <span className="text-fg-subtle font-mono text-[9px] tabular-nums">
          {todayEvents.length} release{todayEvents.length === 1 ? '' : 's'} today · {utcLabel}
        </span>
      </div>

      <div
        className="surface-well relative h-10 w-full overflow-hidden rounded-lg border border-white/[0.07] bg-[#090a0b]"
        role="img"
        aria-label={`Today's macro releases across the 24-hour UTC session. Live time ${utcLabel}.`}
      >
        {SESSION_BANDS.map((band) => (
          <span
            key={band.label}
            aria-hidden="true"
            className={cn('absolute inset-y-0', band.className)}
            style={{ left: band.left, width: band.width }}
          />
        ))}

        {/* London x New York killzone */}
        <span
          aria-hidden="true"
          className="bg-brand/[0.12] border-brand/40 absolute inset-y-0 border-x"
          style={{ left: '50%', width: '16.67%' }}
        />
        <span
          className="text-brand/80 absolute top-0.5 font-mono text-[6px] tracking-wider"
          style={{ left: '50.3%' }}
        >
          KILLZONE
        </span>

        <span className="text-info/70 absolute top-0.5 left-1 font-mono text-[6px] tracking-wider">
          ASIA
        </span>
        <span
          className="text-fg-subtle/70 absolute top-0.5 font-mono text-[6px] tracking-wider"
          style={{ left: '29.5%' }}
        >
          LON
        </span>
        <span className="text-bull/70 absolute top-0.5 right-1 font-mono text-[6px] tracking-wider">
          NY
        </span>

        {todayEvents.map((event) => {
          const pct =
            ((new Date(event.date).getUTCHours() * 60 + new Date(event.date).getUTCMinutes()) /
              1440) *
            100;
          return (
            <span
              key={event.id}
              className={cn(
                'absolute bottom-1.5 z-10 size-2 -translate-x-1/2 rotate-45 rounded-[1px]',
                event.importance === 'high'
                  ? 'bg-danger shadow-[0_0_8px_#f03e3e]'
                  : event.importance === 'medium'
                    ? 'bg-warn'
                    : 'bg-fg-subtle',
              )}
              style={{ left: `${pct}%` }}
              title={`${new Date(event.date).toISOString().slice(11, 16)} UTC · ${event.title} · ${event.importance.toUpperCase()}`}
            />
          );
        })}

        <span
          aria-hidden="true"
          className="bg-brand shadow-[0_0_8px_#ff3616] absolute inset-y-0 z-20 w-px -translate-x-1/2"
          style={{ left: `${nowPct}%` }}
        />
        <span
          aria-hidden="true"
          className="text-brand absolute top-0 z-20 -translate-x-1/2 font-mono text-[8px]"
          style={{ left: `${nowPct}%` }}
        >
          ▼
        </span>
      </div>

      <div className="text-fg-subtle/60 flex justify-between font-mono text-[8px] tabular-nums">
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>24:00</span>
      </div>
    </div>
  );
}

function Countdown({ ms }: { ms: number }) {
  if (ms <= 0) return <span className="text-danger font-semibold">Live now</span>;
  const d = Math.floor(ms / (24 * 60 * 60_000));
  const h = Math.floor((ms % (24 * 60 * 60_000)) / (60 * 60_000));
  const m = Math.floor((ms % (60 * 60_000)) / 60_000);
  if (d > 0) {
    return (
      <span className="text-fg font-semibold">
        in {d}d {h}h
      </span>
    );
  }
  if (h > 0) {
    return (
      <span className="text-fg font-semibold">
        in {h}h {m}m
      </span>
    );
  }
  return <span className="text-warn font-semibold">in {m}m</span>;
}

function CountryChip({
  country,
  currency,
}: {
  country: EconomicEvent['country'];
  currency: EconomicEvent['currency'];
}) {
  const label = currency ?? country;
  return (
    <span className="bg-bg-elev-2 border-border text-caption rounded-sm border px-1.5 py-0.5 font-bold uppercase tabular-nums">
      {label}
    </span>
  );
}

function Tag({
  dot,
  tone,
  label,
  count,
}: {
  dot: string;
  tone: string;
  label: string;
  count: number;
}) {
  return (
    <li className="inline-flex items-center gap-1.5">
      <span aria-hidden className={cn('size-2 rounded-sm', dot)} />
      <span className={cn('font-semibold', tone)}>{label}</span>
      <span className="text-fg">{count}</span>
    </li>
  );
}
