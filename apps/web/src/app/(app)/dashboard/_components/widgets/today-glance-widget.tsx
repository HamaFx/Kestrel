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

// "Today at a glance" hero: next catalyst, live session, open exposure and the
// latest AI nudge. One shared tile shell keeps the four cells aligned.
import type { EconomicEvent, JournalEntry, Symbol } from '@kestrel/shared';
import { IconAlertTriangle, IconBolt, IconClock, IconCompass } from '@tabler/icons-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { SessionDial } from '@/components/layout/session-dial';
import { useTime } from '@/components/providers/time-provider';
import { StatusIndicator } from '@/components/ui/status-indicator';
import { getSessionInfo } from '@/lib/auth/session';
import { cn } from '@/lib/formatters/cn';
import { formatCountdown } from '@/lib/formatters/datetime';

interface TodayGlanceWidgetProps {
  events: EconomicEvent[];
  entries: JournalEntry[];
  /** Latest briefing body (first sentence becomes the nudge). */
  briefingNudge: string | null;
  /** Optional default symbol for the nudge CTA. */
  defaultSymbol?: Symbol;
}

export function TodayGlanceWidget({
  events,
  entries,
  briefingNudge,
  defaultSymbol = 'XAUUSD',
}: TodayGlanceWidgetProps) {
  return (
    <section
      role="status"
      aria-label="Today at a glance"
      className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-4"
    >
      <CellNextEvent events={events} />
      <CellSession />
      <CellOpenRisk entries={entries} />
      <CellAiNudge briefingNudge={briefingNudge} defaultSymbol={defaultSymbol} />
    </section>
  );
}

function GlanceCell({
  icon,
  label,
  tone,
  right,
  footer,
  children,
}: {
  icon: ReactNode;
  label: string;
  tone?: string;
  right?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="surface-card group flex min-h-[126px] flex-col gap-3 rounded-xl border border-white/[0.06] p-4 shadow-sm transition-colors hover:border-white/15">
      <div className="flex items-center justify-between gap-2">
        <div className="text-fg-subtle flex min-w-0 items-center gap-1.5 font-mono text-[10px] font-semibold tracking-wider uppercase">
          <span className={cn('shrink-0', tone ?? 'text-fg-subtle')}>{icon}</span>
          <span className="truncate">{label}</span>
        </div>
        {right}
      </div>
      <div className="flex flex-1 flex-col justify-end gap-1.5">{children}</div>
      {footer}
    </div>
  );
}

function CellNextEvent({ events }: { events: EconomicEvent[] }) {
  const { now } = useTime();
  const upcoming = events.filter((event) => event.date > now).sort((a, b) => a.date - b.date)[0];

  return (
    <GlanceCell
      icon={<IconClock className="size-3.5" strokeWidth={1.9} />}
      label="Next event"
      tone="text-warn"
      right={
        upcoming?.currency ? (
          <span className="bg-warn/10 text-warn border-warn/30 rounded-full border px-1.5 py-0.5 font-mono text-[9px] font-bold">
            {upcoming.currency}
          </span>
        ) : null
      }
      footer={
        upcoming ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-fg-subtle font-mono text-[9px] uppercase">Impact window</span>
            <span className="text-warn font-mono text-[10px] font-semibold tabular-nums">
              {formatCountdown(upcoming.date - now)}
            </span>
          </div>
        ) : null
      }
    >
      {upcoming ? (
        <>
          <span
            className="text-fg line-clamp-2 text-sm leading-snug font-semibold"
            title={upcoming.title}
          >
            {upcoming.title}
          </span>
          <span className="text-fg-subtle text-[10px]">
            {new Date(upcoming.date).toISOString().slice(11, 16)} UTC
          </span>
        </>
      ) : (
        <span className="text-fg-muted text-xs">No high-impact events today</span>
      )}
    </GlanceCell>
  );
}

function CellSession() {
  const { now } = useTime();
  const sessionInfo = getSessionInfo(new Date(now));
  const active = sessionInfo.session !== 'closed' && sessionInfo.session !== 'weekend';

  return (
    <GlanceCell
      icon={<IconCompass className="size-3.5" strokeWidth={1.9} />}
      label="Session"
      right={active ? <StatusIndicator tone="online" label="Session live" /> : null}
      footer={
        <div className="text-fg-subtle flex items-center gap-2.5 font-mono text-[8px] tracking-wider uppercase">
          <span className="inline-flex items-center gap-1">
            <span className="bg-info size-1 rounded-full" /> Asia
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="bg-brand size-1 rounded-full" /> Lon
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="bg-bull size-1 rounded-full" /> NY
          </span>
        </div>
      }
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-fg text-sm font-semibold">{sessionInfo.label}</span>
          <span
            className={cn(
              'inline-flex w-fit items-center rounded-full border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase',
              active
                ? 'bg-bull/10 text-bull border-bull/30'
                : 'bg-bg-elev-2 text-fg-muted border-border',
            )}
          >
            {active ? 'Live' : 'Closed'}
          </span>
        </div>
        <SessionDial now={now} label={sessionInfo.label} active={active} size={60} />
      </div>
    </GlanceCell>
  );
}

function CellOpenRisk({ entries }: { entries: JournalEntry[] }) {
  const open = entries.filter((entry) => entry.outcome === 'open');
  const withoutStop = open.filter((entry) => entry.stop === null).length;
  const protectedCount = open.length - withoutStop;
  const protectedPct = open.length > 0 ? (protectedCount / open.length) * 100 : 0;
  const symbols = Array.from(new Set(open.map((entry) => entry.symbol)))
    .slice(0, 3)
    .join(', ');

  return (
    <GlanceCell
      icon={<IconAlertTriangle className="size-3.5" strokeWidth={1.9} />}
      label="Open risk"
      tone="text-danger"
      right={
        withoutStop > 0 ? (
          <span className="bg-danger/10 text-danger border-danger/30 rounded-full border px-1.5 py-0.5 font-mono text-[9px] font-bold tabular-nums">
            {withoutStop} no stop
          </span>
        ) : null
      }
      footer={
        open.length > 0 ? (
          <div className="flex flex-col gap-1">
            <div className="flex h-1 gap-0.5 overflow-hidden rounded-full bg-black/30">
              <div
                className="bg-bull/70 h-full rounded-full"
                style={{ width: `${protectedPct}%` }}
              />
              <div
                className="bg-danger h-full rounded-full"
                style={{ width: `${100 - protectedPct}%` }}
              />
            </div>
            <div className="text-fg-subtle flex justify-between font-mono text-[8px] uppercase">
              <span>{protectedCount} protected</span>
              <span className={withoutStop > 0 ? 'text-danger' : undefined}>
                {withoutStop} exposed
              </span>
            </div>
          </div>
        ) : null
      }
    >
      {open.length === 0 ? (
        <span className="text-fg-muted text-xs">No open risk</span>
      ) : (
        <>
          <span className="text-fg text-sm font-semibold">
            {open.length} {open.length === 1 ? 'position' : 'positions'}
          </span>
          <span className="text-fg-subtle truncate font-mono text-[10px]" title={symbols}>
            {symbols}
          </span>
        </>
      )}
    </GlanceCell>
  );
}

function CellAiNudge({
  briefingNudge,
  defaultSymbol,
}: {
  briefingNudge: string | null;
  defaultSymbol: Symbol;
}) {
  const nudge = briefingNudge ?? `Ask AI about today's bias for ${defaultSymbol}`;

  return (
    <GlanceCell
      icon={<IconBolt className="size-3.5" strokeWidth={1.9} />}
      label="AI insight"
      tone="text-brand"
      right={
        <Link
          href="/chat"
          className="text-brand font-mono text-[9px] font-semibold hover:underline"
        >
          Ask AI →
        </Link>
      }
      footer={
        <span className="text-fg-subtle font-mono text-[8px] tracking-wider uppercase">
          {briefingNudge ? 'Latest briefing' : 'Start a conversation'}
        </span>
      }
    >
      <p className="text-fg line-clamp-2 border-l-2 border-brand/40 pl-2 text-xs leading-snug">
        {nudge}
      </p>
    </GlanceCell>
  );
}
