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

// Council Command Pedestal for an empty /chat: combines the 3-Layer Sovereign
// Arbiter Scales & Pantheon War Room showcase with four Fast Scout lenses
// (each with its chiaroscuro plate vignette) and the quick dispatch strip for
// both mobile and desktop.
import type { Symbol } from '@kestrel/shared';
import { IconArrowRight, IconUsers } from '@tabler/icons-react';
import { useMemo, useState } from 'react';

import { BlueprintPlate, type BlueprintPlateId } from '@/components/brand/blueprint-plates';
import type { AnalysisMode } from '@/lib/analysis-mode';
import { cn } from '@/lib/formatters/cn';
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

const CHAMBER_PLATES: Array<{ id: BlueprintPlateId; label: string }> = [
  { id: 'arbiter', label: 'Arbiter Scales' },
  { id: 'warroom', label: 'Pantheon Chamber' },
  { id: 'obelisk', label: 'Meridian Obelisk' },
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
  const [chamberPlate, setChamberPlate] = useState<BlueprintPlateId>('arbiter');
  const sym = pinnedSymbol ?? 'XAUUSD';
  const quickQueries = useMemo(() => QUICK_QUERIES(sym), [sym]);

  return (
    <div className="relative flex min-h-[60svh] flex-col items-center justify-center px-3 py-5 select-none sm:px-4 sm:py-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
      >
        <BlueprintPlate
          id={chamberPlate}
          showRasterBackup
          className="h-[460px] w-[460px] opacity-35"
        />
      </div>

      <div className="relative z-10 flex w-full max-w-4xl flex-col gap-3.5">
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
          {/* Stage I → II: Full Council Trigger + Interactive 3-Layer Arbiter Showcase */}
          <div className="grid grid-cols-1 gap-4 p-3.5 sm:p-4 lg:grid-cols-12 lg:items-center">
            <div className="flex flex-col justify-between gap-3 lg:col-span-7">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
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

                  <div className="flex items-center gap-1 rounded-md border border-white/10 bg-black/40 p-0.5">
                    {CHAMBER_PLATES.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setChamberPlate(p.id)}
                        className={cn(
                          'rounded px-1.5 py-0.5 font-mono text-[8px] font-semibold tracking-wider uppercase transition-colors',
                          chamberPlate === p.id
                            ? 'bg-brand text-white'
                            : 'text-fg-subtle hover:text-fg',
                        )}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-fg-muted mt-2 max-w-xl font-sans text-xs leading-relaxed">
                  HORUS, ASTROLABE, AEGIS, and SENTINEL deliberate in parallel; the Arbiter
                  certifies one unified plan with entry, invalidation, and multi-tier targets.
                </p>
              </div>

              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelect(COUNCIL_PROMPT, 'full')}
                className="border-brand/60 bg-brand inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border px-4 py-2 font-mono text-[11px] font-semibold tracking-wider text-white uppercase transition-all hover:brightness-110 active:translate-y-[0.5px] disabled:pointer-events-none disabled:opacity-50 sm:w-auto sm:self-start"
              >
                Convene 4-desk Syndicate
                <IconArrowRight className="size-3.5" />
              </button>
            </div>

            <div className="lg:col-span-5">
              <BlueprintPlate
                id={chamberPlate}
                variant="showcase"
                showRasterBackup
                allowLayerToggle
                className="h-[172px] w-full sm:h-[184px]"
              />
            </div>
          </div>

          {/* Specialist Fast Scout lenses — flush hairline cells with chiaroscuro plates */}
          <div className="grid grid-cols-1 divide-y divide-white/[0.06] sm:grid-cols-2 sm:divide-x lg:grid-cols-4 lg:divide-y-0">
            {FOUR_SPECIALIST_DESKS.map((desk) => (
              <button
                key={desk.id}
                type="button"
                disabled={disabled}
                onClick={() => onSelect(desk.defaultPrompt, 'single')}
                className="group flex flex-col justify-between gap-2.5 bg-[#121315] p-3 text-left transition-colors hover:bg-white/[0.03] active:translate-y-[0.5px] disabled:pointer-events-none disabled:opacity-50"
              >
                <BlueprintPlate
                  id={desk.blueprintId}
                  variant="compact"
                  showRasterBackup
                  showAsciiStrip
                  className="h-24 w-full"
                />
                <div className="flex items-center justify-between gap-1">
                  <span className="text-brand font-mono text-[8px] font-semibold tracking-wider uppercase">
                    {desk.code}
                  </span>
                  <span
                    aria-hidden="true"
                    className="size-1.5 rounded-full opacity-70 transition-opacity group-hover:opacity-100"
                    style={{ backgroundColor: desk.accentColor }}
                  />
                </div>
                <div className="min-w-0">
                  <div className="font-display text-fg truncate text-xs font-normal">
                    {desk.title}
                  </div>
                  <div className="font-redaction-35 text-fg-muted truncate text-[11px] italic">
                    {desk.epithet}
                  </div>
                </div>
                <div className="text-fg-subtle group-hover:text-brand flex items-center justify-between font-mono text-[8px] tracking-wider uppercase transition-colors">
                  <span>Fast Scout</span>
                  <IconArrowRight className="size-2.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </button>
            ))}
          </div>

          {/* Quick ticker dispatch strip */}
          <div className="flex flex-wrap items-center gap-1.5 bg-[#101113] px-3 py-2.5">
            <span className="text-fg-subtle/70 mr-1 font-mono text-[8px] tracking-[0.14em] uppercase">
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
