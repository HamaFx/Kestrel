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

// Phase 1.9 — "Today at a glance" hero.
//
// 2×2 (mobile) / 1×4 (desktop) strip above the dashboard fold. Each cell
// is a self-contained micro-summary: next event countdown, current
// trading session, open risk, and an AI nudge link to chat.
//
// Uses the shared `TimeProvider` so the countdown ticks without each
// cell starting its own interval. All numerals are `tabular-nums`.
import type { EconomicEvent, JournalEntry, Symbol } from '@kestrel/shared';
import { IconAlertTriangle, IconBolt, IconClock, IconCompass } from '@tabler/icons-react';
import Link from 'next/link';

import { useTime } from '@/components/providers/time-provider';
import { cn } from '@/lib/cn';
import { formatCountdown } from '@/lib/datetime';
import { getSessionInfo } from '@/lib/session';

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

// -----------------------------------------------------------------------
// Cell 1 — Next high-impact event countdown
// -----------------------------------------------------------------------

function CellNextEvent({ events }: { events: EconomicEvent[] }) {
  const { now } = useTime();
  const upcoming = events.filter((e) => e.date > now).sort((a, b) => a.date - b.date)[0];

  return (
    <div className="border-border bg-bg-elev-1 flex flex-col justify-between gap-1.5 rounded-sm border p-3 shadow-xs">
      <div className="text-fg-subtle text-caption flex items-center justify-between font-semibold tracking-wider uppercase">
        <div className="flex items-center gap-1.5">
          <IconClock className="text-warn size-3.5" />
          <span>Next event</span>
        </div>
        {upcoming?.currency && (
          <span className="bg-warn/10 text-warn border-warn/30 rounded-2xs border px-1 py-0.2 font-mono text-[9px] font-bold">
            {upcoming.currency}
          </span>
        )}
      </div>
      {upcoming ? (
        <div className="flex flex-col gap-0.5">
          <span className="text-fg text-body-sm line-clamp-1 font-semibold" title={upcoming.title}>
            {upcoming.title}
          </span>
          <span className="text-warn text-caption font-mono font-medium tabular-nums">
            {formatCountdown(upcoming.date - now)}
          </span>
        </div>
      ) : (
        <span className="text-fg-muted text-caption">No high-impact events today</span>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------
// Cell 2 — Current trading session (UTC-anchored via session helper)
// -----------------------------------------------------------------------

function CellSession() {
  const { now } = useTime();
  const sessionInfo = getSessionInfo(new Date(now));
  const active = sessionInfo.session !== 'closed' && sessionInfo.session !== 'weekend';

  return (
    <div className="border-border bg-bg-elev-1 flex flex-col justify-between gap-1.5 rounded-sm border p-3 shadow-xs">
      <div className="text-fg-subtle text-caption flex items-center justify-between font-semibold tracking-wider uppercase">
        <div className="flex items-center gap-1.5">
          <IconCompass className="text-fg size-3.5" />
          <span>Session</span>
        </div>
        {active && (
          <span className="flex size-1.5 rounded-full bg-bull animate-pulse" />
        )}
      </div>
      <div className="flex items-center justify-between gap-1">
        <span className="text-fg text-body-sm font-semibold">{sessionInfo.label}</span>
        <span
          className={cn(
            'text-[10px] inline-flex items-center rounded-2xs px-1.5 py-0.5 font-mono font-semibold uppercase',
            active ? 'bg-bull/10 text-bull border border-bull/30' : 'bg-bg-elev-2 text-fg-muted border border-border',
          )}
        >
          {active ? 'Live' : 'Closed'}
        </span>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// Cell 3 — Open risk
// -----------------------------------------------------------------------

function CellOpenRisk({ entries }: { entries: JournalEntry[] }) {
  const open = entries.filter((e) => e.outcome === 'open');
  const totalRRounded = Math.round(open.length * 10) / 10;

  return (
    <div className="border-border bg-bg-elev-1 flex flex-col justify-between gap-1.5 rounded-sm border p-3 shadow-xs">
      <div className="text-fg-subtle text-caption flex items-center gap-1.5 font-semibold tracking-wider uppercase">
        <IconAlertTriangle className="text-danger size-3.5" />
        <span>Open risk</span>
      </div>
      {open.length === 0 ? (
        <span className="text-fg-muted text-caption">No open risk</span>
      ) : (
        <div className="flex items-baseline justify-between gap-1 font-mono">
          <span className="text-fg text-body-sm font-semibold">
            {open.length} {open.length === 1 ? 'pos' : 'positions'}
          </span>
          <span className="text-danger text-caption font-bold tabular-nums">
            {totalRRounded}R at risk
          </span>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------
// Cell 4 — AI nudge
// -----------------------------------------------------------------------

function CellAiNudge({
  briefingNudge,
  defaultSymbol,
}: {
  briefingNudge: string | null;
  defaultSymbol: Symbol;
}) {
  const nudge = briefingNudge ?? `Ask AI about today's bias for ${defaultSymbol}`;
  return (
    <div className="border-border bg-bg-elev-1 flex flex-col justify-between gap-1.5 rounded-sm border p-3 shadow-xs">
      <div className="text-fg-subtle text-caption flex items-center justify-between font-semibold tracking-wider uppercase">
        <div className="flex items-center gap-1.5">
          <IconBolt className="text-brand size-3.5" />
          <span>AI Insight</span>
        </div>
        <Link
          href="/chat"
          className="text-brand hover:underline font-mono text-[10px] font-semibold"
        >
          Copilot →
        </Link>
      </div>
      <p className="text-fg text-body-sm line-clamp-1 leading-snug">{nudge}</p>
    </div>
  );
}

