// SPDX-License-Identifier: Apache-2.0

'use client';

// Unified Telemetry Ribbon — the single 28px market bar under the TopBar.
// Left dock: UTC clock + session pills + conditional killzone cue.
// Right: the seamless price marquee (every symbol links to its chart).
//
// Replaces the stacked ticker (28px) + session bar (24px) pair with one strip.
// `TickerTape` remains exported as a standalone surface for reuse.
import { IconClock, IconFlame } from '@tabler/icons-react';

import { cn } from '@/lib/formatters/cn';

import { TickerTape } from './ticker-tape';
import { useMarketSessions } from './use-market-sessions';

export function TelemetryRibbon() {
  const { utcStr, sessions, isKillzoneActive, killzoneLabel } = useMarketSessions();

  return (
    <div
      aria-label="Market telemetry ribbon"
      className="relative flex h-7 items-stretch border-b border-white/[0.07] bg-[#0d0e10] font-mono text-[11px]"
    >
      <div className="relative z-10 flex shrink-0 items-center gap-1.5 border-r border-white/[0.08] bg-[#101113] px-2 sm:gap-2 sm:px-3">
        <span className="text-fg-subtle flex items-center gap-1.5">
          <IconClock className="size-3" strokeWidth={1.75} />
          <span className="text-fg-muted font-medium tabular-nums">{utcStr}</span>
        </span>
        <span aria-hidden="true" className="h-3 w-px bg-white/10" />
        <div className="flex items-center gap-1">
          {sessions.map((session) => (
            <span
              key={session.id}
              title={`${session.name} (${session.startHourUtc}:00–${session.endHourUtc}:00 UTC)`}
              className={cn(
                'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] leading-none font-semibold tracking-wider uppercase',
                session.active ? 'border-bull/30 bg-bull/15 text-bull border' : 'text-fg-subtle/60',
              )}
            >
              {session.shortName}
            </span>
          ))}
        </div>
        {isKillzoneActive ? (
          <span className="border-brand/30 bg-brand/10 text-brand inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] leading-none font-semibold tracking-wider uppercase">
            <IconFlame className="size-2.5" strokeWidth={2} />
            <span className="hidden sm:inline">{killzoneLabel}</span>
          </span>
        ) : null}
      </div>

      <TickerTape embedded />
    </div>
  );
}
