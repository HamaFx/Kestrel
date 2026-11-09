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

// SPDX-License-Identifier: Apache-2.0

// Council Command Pedestal for an empty /chat: a single compact institutional
// pedestal combining the Full 4-Desk Council trigger, four flush Fast Scout
// specialist lenses, and the quick ticker dispatch strip.
import type { Symbol } from '@kestrel/shared';
import { IconArrowRight, IconUsers } from '@tabler/icons-react';
import { useMemo } from 'react';

import { BlueprintPlate } from '@/components/brand/blueprint-plates';
import type { AnalysisMode } from '@/lib/analysis-mode';
import { FOUR_SPECIALIST_DESKS } from '@/lib/kestrel-strategist-desks';

const COUNCIL_PROMPT =
  'Convene the full 4-desk council: synthesize macro, technical, risk, and flow positioning into one certified execution plan for XAUUSD.';

const QUICK_QUERIES = (sym: Symbol) => [
  { label: '4H Structure', prompt: `Analyze ${sym} 4H structure and swing levels` },
  { label: 'Session Levels', prompt: `Key session levels and ranges for ${sym}` },
  { label: 'Real Yields', prompt: `Macro real-yield and DXY read for ${sym}` },
  { label: '1% Risk Plan', prompt: `Build a 1% risk plan with invalidation for ${sym}` },
  { label: 'COT Flow', prompt: `COT positioning and institutional flow for ${sym}` },
];

export function ChatEmptyState({
  pinnedSymbol,
  disabled,
  onSelect,
}: {
  pinnedSymbol: Symbol | null;
  disabled?: boolean;
  /** `modeOverride` arms the analysis mode for this dispatch (Full Council). */
  onSelect: (text: string, modeOverride?: AnalysisMode) => void;
}) {
  const sym = pinnedSymbol ?? 'XAUUSD';
  const quickQueries = useMemo(() => QUICK_QUERIES(sym), [sym]);

  return (
    <div className="relative flex min-h-[60svh] flex-col items-center justify-center px-3 py-5 select-none sm:px-4 sm:py-6">
      <BlueprintPlate
        id="arbiter"
        showRasterBackup
        variant="watermark"
        className="pointer-events-none absolute inset-0 m-auto size-[400px] opacity-15"
      />

      <div className="relative z-10 flex w-full max-w-3xl flex-col gap-4">
        {/* Compact chamber header */}
        <div className="flex flex-col items-center gap-1.5 text-center">
          <div className="border-brand/30 bg-brand/10 text-brand inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[9px] font-semibold tracking-[0.18em] uppercase">
            <IconUsers className="size-3" />
            Sovereign Council Chamber
          </div>
          <h2 className="font-display text-fg text-xl font-normal tracking-[-0.03em] sm:text-2xl lg:text-3xl">
            Convene the <span className="font-redaction-35 text-brand italic">Council</span> of
            Strategists
          </h2>
          <p className="text-fg-muted max-w-xl font-sans text-[11px] leading-relaxed sm:text-xs">
            Commission the unified four-desk council for a certified execution plan, or deploy a
            single specialist lens for a fast targeted read.
          </p>
        </div>

        {/* Unified pedestal frame */}
        <div className="divide-y divide-white/[0.07] overflow-hidden rounded-2xl border border-white/10 bg-[#121315]/95 shadow-2xl">
          {/* Top Row: Stage I → II Full Council Primary Trigger */}
          <div className="flex flex-col justify-between gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {FOUR_SPECIALIST_DESKS.map((desk) => (
                  <span
                    key={desk.id}
                    className="text-fg-subtle inline-flex items-center gap-1 font-mono text-[9px] tracking-wider"
                  >
                    <span
                      aria-hidden="true"
                      className="size-1.5 rounded-full"
                      style={{ backgroundColor: desk.accentColor }}
                    />
                    {desk.label.toUpperCase()}
                  </span>
                ))}
                <span className="text-fg-subtle/50 font-mono text-[9px]">·</span>
                <span className="text-brand font-mono text-[9px] font-semibold tracking-wider">
                  STAGE I → II
                </span>
              </div>
              <p className="text-fg-muted mt-1.5 max-w-xl font-sans text-xs leading-relaxed">
                HORUS, ASTROLABE, AEGIS, and SENTINEL deliberate in parallel; the Arbiter certifies
                one unified plan with entry, invalidation, and multi-tier targets.
              </p>
            </div>

            <button
              type="button"
              disabled={disabled}
              onClick={() => onSelect(COUNCIL_PROMPT, 'full')}
              className="border-brand/60 bg-brand inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-lg border px-4 py-2 font-mono text-[11px] font-semibold tracking-wider text-white uppercase shadow-[0_4px_14px_rgba(255,54,22,0.28),inset_0_1px_0_rgba(255,255,255,0.28)] transition-all hover:brightness-110 active:translate-y-[0.5px] disabled:pointer-events-none disabled:opacity-50 sm:w-auto"
            >
              Convene 4-Desk Syndicate
              <IconArrowRight className="size-3.5" />
            </button>
          </div>

          {/* Middle Row: 4 Specialist Fast Scout lenses — flush hairline cells */}
          <div className="grid grid-cols-2 divide-x divide-y divide-white/[0.06] lg:grid-cols-4 lg:divide-y-0">
            {FOUR_SPECIALIST_DESKS.map((desk) => (
              <button
                key={desk.id}
                type="button"
                disabled={disabled}
                onClick={() => onSelect(desk.defaultPrompt, 'single')}
                className="group relative flex min-h-[112px] flex-col justify-between gap-2.5 overflow-hidden bg-[#121315] p-3.5 text-left transition-colors hover:bg-white/[0.03] active:translate-y-[0.5px] disabled:pointer-events-none disabled:opacity-50"
              >
                <BlueprintPlate
                  id={desk.blueprintId}
                  showRasterBackup
                  variant="watermark"
                  className="pointer-events-none absolute -top-2 -right-2 z-0 size-24 opacity-20 transition-opacity group-hover:opacity-35"
                />
                <div className="relative z-10 flex items-center justify-between gap-1">
                  <span className="text-brand font-mono text-[9px] font-semibold tracking-wider uppercase">
                    {desk.code}
                  </span>
                  <span
                    aria-hidden="true"
                    className="size-1.5 rounded-full opacity-75 transition-opacity group-hover:opacity-100"
                    style={{ backgroundColor: desk.accentColor }}
                  />
                </div>
                <div className="relative z-10 min-w-0">
                  <div className="font-display text-fg truncate text-xs font-normal sm:text-sm">
                    {desk.title}
                  </div>
                  <div className="font-redaction-35 text-fg-muted truncate text-[11px] italic">
                    &ldquo;{desk.epithet}&rdquo;
                  </div>
                </div>
                <div className="text-fg-subtle group-hover:text-brand relative z-10 flex items-center justify-between font-mono text-[9px] tracking-wider uppercase transition-colors">
                  <span>Fast Scout</span>
                  <IconArrowRight className="size-2.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </button>
            ))}
          </div>

          {/* Bottom Row: Quick ticker dispatch strip */}
          <div className="flex flex-wrap items-center gap-1.5 bg-[#101113] px-3.5 py-2.5">
            <span className="text-fg-subtle/70 mr-1 font-mono text-[9px] tracking-[0.14em] uppercase">
              Dispatch
            </span>
            {quickQueries.map((query) => (
              <button
                key={query.label}
                type="button"
                disabled={disabled}
                onClick={() => onSelect(query.prompt)}
                className="border-border/60 text-fg-muted hover:border-brand/40 hover:text-brand inline-flex min-h-9 items-center gap-1 rounded-md border bg-white/[0.02] px-2.5 py-1 font-mono text-[10px] transition-colors active:translate-y-[0.5px] disabled:pointer-events-none disabled:opacity-50 sm:min-h-8"
              >
                <span className="text-brand">›</span>
                {query.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
