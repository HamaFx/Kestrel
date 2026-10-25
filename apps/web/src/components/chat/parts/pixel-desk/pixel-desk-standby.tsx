'use client';

// SPDX-License-Identifier: Apache-2.0

// Standby ledger for the 4-Desk AI Research Committee. Rendered in the chat
// empty state and the dashboard widget; owns only desk-selection state.
import { useMemo, useState } from 'react';

import { getSessionInfo } from '@/lib/auth/session';
import { cn } from '@/lib/formatters/cn';

import {
  CHARACTER_PROFILES,
  DESK_ORDER,
  DESK_SHORT_LABELS,
  type DeskId,
} from './character-profiles';
import { buildDeskBriefs, selectVisibleBriefs } from './desk-briefs';
import { QUICK_SYMBOLS, renderDeskGlyph } from './pixel-primitives';

/**
 * PixelDeskStandby
 * Clean, high-signal 4-Desk Research Ledger for the Chat empty state and Dashboard widget.
 * Replaces arcade CRT clutter with a calm, institutional 4-desk matrix and direct brief launcher.
 */
export function PixelDeskStandby({
  pinnedSymbol,
  onSelectPrompt,
  disabled,
  now,
  className,
}: {
  pinnedSymbol?: string | null;
  onSelectPrompt?: (prompt: string) => void;
  disabled?: boolean;
  now?: Date;
  className?: string;
}) {
  const [activeDesk, setActiveDesk] = useState<'all' | DeskId>('all');
  const [customSymbol, setCustomSymbol] = useState<string | null>(null);

  const sessionInfo = useMemo(() => getSessionInfo(now ?? new Date()), [now]);
  const activeSymbol = (customSymbol ?? pinnedSymbol ?? 'XAUUSD').toUpperCase();

  const deskBriefs = useMemo(
    () => buildDeskBriefs(activeSymbol, sessionInfo.label),
    [activeSymbol, sessionInfo.label],
  );

  const visibleBriefs = useMemo(
    () => selectVisibleBriefs(deskBriefs, activeDesk),
    [activeDesk, deskBriefs],
  );

  return (
    <div
      role="region"
      aria-label="4-Desk AI Research Committee"
      className={cn(
        'border-border bg-bg-elev-1 flex w-full max-w-2xl flex-col overflow-hidden rounded-xl border text-left shadow-sm',
        className,
      )}
    >
      {/* Top Bar: Committee Identity + Active Session + Symbol Selector */}
      <div className="border-border/70 flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="bg-bull size-2 rounded-full" />
          <span className="text-fg text-xs font-semibold tracking-tight">
            4-Desk Research Committee
          </span>
          <span className="text-fg-subtle text-xs">·</span>
          <span className="text-fg-muted font-mono text-xs tabular-nums">
            {sessionInfo.label} Session
          </span>
        </div>

        {/* Clean Instrument Switcher */}
        <div className="bg-bg-elev-2 border-border/70 flex items-center gap-0.5 rounded-lg border p-0.5">
          {QUICK_SYMBOLS.map((sym) => {
            const isSelected = activeSymbol === sym;
            return (
              <button
                key={sym}
                type="button"
                onClick={() => setCustomSymbol(sym)}
                className={cn(
                  'cursor-pointer touch-manipulation rounded-md px-2 py-1 font-mono text-xs font-medium transition-colors',
                  isSelected
                    ? 'bg-bg-elev-3 text-fg font-semibold shadow-2xs'
                    : 'text-fg-subtle hover:text-fg',
                )}
              >
                {sym}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4-Column Interactive Desk Matrix (Click any desk to filter its briefs) */}
      <div className="border-border/70 grid grid-cols-2 divide-x divide-y border-b sm:grid-cols-4 sm:divide-y-0">
        {DESK_ORDER.map((deskId) => {
          const profile = CHARACTER_PROFILES[deskId]!;
          const isSelected = activeDesk === deskId;
          return (
            <button
              key={deskId}
              type="button"
              disabled={disabled}
              onClick={() => setActiveDesk(isSelected ? 'all' : deskId)}
              aria-pressed={isSelected}
              className={cn(
                'group flex cursor-pointer touch-manipulation flex-col items-start gap-2 p-3.5 text-left transition-colors disabled:opacity-50',
                isSelected ? 'bg-bg-elev-2' : 'hover:bg-bg-elev-2/50 bg-transparent',
              )}
            >
              <div className="flex w-full items-center justify-between">
                {renderDeskGlyph(deskId)}
                <span
                  className={cn(
                    'rounded-sm border px-1.5 py-0.5 font-mono text-xs font-medium',
                    isSelected
                      ? profile.badgeClass
                      : 'border-border/60 bg-bg-elev-2 text-fg-subtle',
                  )}
                >
                  {DESK_SHORT_LABELS[deskId]}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-fg text-xs font-semibold">{profile.name}</span>
                <span className="text-fg-subtle line-clamp-1 text-xs">{profile.indicators}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Primary Committee Action + Curated Desk Prompts */}
      {onSelectPrompt && (
        <div className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-fg-muted text-xs font-medium">
                {activeDesk === 'all'
                  ? `Recommended briefs for ${activeSymbol}`
                  : `${CHARACTER_PROFILES[activeDesk]?.name} briefs for ${activeSymbol}`}
              </span>
              {activeDesk !== 'all' && (
                <button
                  type="button"
                  onClick={() => setActiveDesk('all')}
                  className="text-brand cursor-pointer text-xs font-medium hover:underline"
                >
                  Show all 4 desks
                </button>
              )}
            </div>

            <button
              type="button"
              disabled={disabled}
              onClick={() =>
                onSelectPrompt(
                  `Convene full 4-desk research committee on ${activeSymbol} across Technical Structure, Macro & Rates, Risk Sizing, and Institutional Flow.`,
                )
              }
              className="bg-brand hover:bg-brand-soft text-brand-fg inline-flex cursor-pointer touch-manipulation items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              <span>Convene Full Committee on {activeSymbol}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {visibleBriefs.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={disabled}
                onClick={() => onSelectPrompt(item.prompt)}
                className="border-border/80 bg-bg-elev-2/60 hover:bg-bg-elev-2 hover:border-fg-subtle/40 flex cursor-pointer touch-manipulation flex-col gap-1 rounded-lg border p-3 text-left transition-colors disabled:opacity-50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-fg text-xs font-semibold">{item.title}</span>
                  <span className="text-fg-subtle font-mono text-xs">{item.desk}</span>
                </div>
                <span className="text-fg-muted line-clamp-1 text-xs">{item.detail}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
