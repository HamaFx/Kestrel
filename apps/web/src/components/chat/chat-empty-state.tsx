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

// Neoclassical Archival Empty State for the Council Chamber (/chat): the
// "Convene the Full 4-Desk Council" hero banner, the four canonical specialist
// desk quick-launch cards (each runs Fast Scout with its desk lens), and the
// quick direct-query chips.
import type { Symbol } from '@kestrel/shared';
import { IconArrowRight, IconSparkles, IconUsers } from '@tabler/icons-react';
import Image from 'next/image';
import { useMemo } from 'react';

import type { AnalysisMode } from '@/lib/analysis-mode';
import { FOUR_SPECIALIST_DESKS, type StrategistDeskConfig } from '@/lib/kestrel-strategist-desks';

const COUNCIL_PROMPT =
  'Convene the full 4-desk council: synthesize macro, technical, risk, and flow positioning into one certified execution plan for XAUUSD.';

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

  const quickPrompts = useMemo(
    () => [
      `Analyze ${sym} 4H structure`,
      `Key liquidation levels for ${sym}`,
      `SMC Order Blocks on ${sym}`,
      `Macro Yield Dynamics on ${sym}`,
      `Risk Budget & Invalidation for ${sym}`,
      'Compare EURUSD vs GBPUSD',
    ],
    [sym],
  );

  return (
    <div className="relative flex min-h-[68svh] flex-col items-center justify-center gap-5 px-4 py-8 select-none">
      {/* ── Background: Bebas watermark + neoclassical Horus engraving ── */}
      <span
        aria-hidden="true"
        className="font-bebas text-fg pointer-events-none absolute top-6 left-1/2 z-0 -translate-x-1/2 text-center text-4xl tracking-[0.24em] opacity-[0.018] select-none sm:text-6xl"
      >
        KESTREL // SOVEREIGN COUNCIL
      </span>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden opacity-10 mix-blend-luminosity"
      >
        <div className="relative h-[480px] w-[480px] sm:h-[560px] sm:w-[560px]">
          <Image
            src="/landing/kestrel-horus-statue.webp"
            alt=""
            fill
            unoptimized
            className="object-contain"
          />
          <div className="absolute inset-0 bg-radial from-transparent via-[#09090B]/60 to-[#09090B]" />
        </div>
      </div>

      {/* ── Pediment header ── */}
      <div className="relative z-10 flex w-full max-w-3xl flex-col items-center text-center">
        <div className="border-brand/30 bg-brand/10 text-brand mb-2 inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[10px] font-semibold tracking-[0.18em] uppercase shadow-[0_0_12px_rgba(255,54,22,0.15)]">
          <IconSparkles className="size-3" />
          <span>INSTITUTIONAL COUNCIL CHAMBER</span>
        </div>

        <h2 className="font-display text-fg text-2xl font-normal tracking-[-0.03em] sm:text-3xl lg:text-4xl">
          Convene the <span className="text-brand font-serif italic">Council of Strategists</span>
        </h2>

        <p className="text-fg-muted mt-2 max-w-xl text-xs leading-relaxed sm:text-sm">
          Commission the unified four-desk council for cross-examined synthesis and a certified
          execution plan, or deploy a single specialist desk for a fast targeted read.
        </p>
      </div>

      {/* ── Hero: Convene the Full 4-Desk Council ── */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSelect(COUNCIL_PROMPT, 'full')}
        className="surface-panel group relative z-10 flex w-full max-w-3xl flex-col gap-3 overflow-hidden rounded-2xl border border-[rgba(255,54,22,0.45)] p-4 text-left shadow-xl transition-all hover:brightness-[1.06] active:translate-y-[0.5px] disabled:pointer-events-none disabled:opacity-50 sm:p-5"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 52% 44% at 100% 0%, rgba(255,54,22,0.14) 0%, transparent 70%)',
        }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-6 -bottom-10 z-0 h-48 w-72 opacity-[0.14] mix-blend-luminosity transition-opacity group-hover:opacity-25"
        >
          <Image
            src="/landing/desks-council-strategists.webp"
            alt=""
            fill
            unoptimized
            className="object-contain object-right"
          />
        </div>

        <div className="text-brand relative z-10 flex items-center gap-2 font-mono text-[10px] font-semibold tracking-[0.18em] uppercase">
          <IconUsers className="size-3.5" />
          STAGE I → STAGE II · FULL COUNCIL
        </div>
        <div className="relative z-10">
          <h3 className="font-display text-fg text-lg font-normal tracking-[-0.02em] sm:text-xl">
            Convene the Full 4-Desk Council
          </h3>
          <p className="text-fg-muted mt-1 max-w-2xl text-xs leading-relaxed sm:text-sm">
            HORUS, ASTROLABE, HOPLITE, and SENTINEL deliberate in parallel, cross-examine each
            other&apos;s assumptions, and the Arbiter certifies one trade plan with entry,
            invalidation, and targets.
          </p>
        </div>
        <div className="border-brand/60 bg-brand relative z-10 mt-1 inline-flex w-fit items-center gap-2 rounded-lg border px-4 py-2 font-mono text-xs font-semibold tracking-wider text-white uppercase shadow-md transition-all group-hover:brightness-110">
          <span>Convene 4-Desk Syndicate</span>
          <IconArrowRight className="size-3.5" />
        </div>
      </button>

      {/* ── 4 Specialist Desk Quick-Launch Cards (Fast Scout) ── */}
      <div className="relative z-10 grid w-full max-w-3xl grid-cols-2 gap-3 lg:grid-cols-4">
        {FOUR_SPECIALIST_DESKS.map((desk) => (
          <DeskQuickCard
            key={desk.id}
            desk={desk}
            disabled={disabled}
            onSelect={() => onSelect(desk.defaultPrompt, 'single')}
          />
        ))}
      </div>

      {/* ── Quick prompt chips ── */}
      <div className="relative z-10 flex w-full max-w-3xl flex-col items-center gap-2 pt-1">
        <span className="text-fg-subtle font-mono text-[10px] font-semibold tracking-wider uppercase">
          Or dispatch a direct market query
        </span>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(prompt)}
              className="border-border/50 bg-bg-elev-1 text-fg/80 hover:border-brand/40 hover:text-brand inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-xs transition-all active:translate-y-[0.5px] disabled:pointer-events-none disabled:opacity-50 sm:min-h-0"
            >
              <span className="text-brand">›</span>
              <span>{prompt}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function DeskQuickCard({
  desk,
  disabled,
  onSelect,
}: {
  desk: StrategistDeskConfig;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className="group surface-card border-border/50 bg-bg-elev-1 hover:border-brand/40 hover:bg-bg-elev-2 relative flex min-h-[132px] flex-col justify-between overflow-hidden rounded-xl border p-3.5 text-left transition-all duration-200 active:translate-y-[0.5px] disabled:pointer-events-none disabled:opacity-50"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-3 -right-3 z-0 size-20 opacity-[0.12] mix-blend-luminosity transition-opacity group-hover:opacity-25"
      >
        <Image src={desk.artworkPath} alt="" fill unoptimized className="object-contain" />
      </div>

      <div className="relative z-10 flex flex-col gap-1">
        <div className="flex items-center justify-between gap-1">
          <span className="text-brand font-mono text-[9px] font-semibold tracking-wider uppercase">
            {desk.code}
          </span>
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: desk.accentColor }}
          />
        </div>
        <div className="font-display text-fg text-sm font-normal">{desk.title}</div>
        <div className="text-fg-muted font-serif text-xs italic">&ldquo;{desk.epithet}&rdquo;</div>
      </div>

      <div className="border-border/30 text-fg-muted group-hover:text-brand relative z-10 mt-3 flex items-center justify-between border-t pt-2 font-mono text-[10px]">
        <span>⚡ Fast Scout</span>
        <IconArrowRight className="text-brand size-3 transition-transform group-hover:translate-x-0.5" />
      </div>
    </button>
  );
}
