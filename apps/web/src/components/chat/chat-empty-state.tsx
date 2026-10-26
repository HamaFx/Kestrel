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

// Neoclassical Archival Empty State for Council Chamber (/chat).
import type { Symbol } from '@kestrel/shared';
import { IconArrowRight, IconSparkles } from '@tabler/icons-react';
import Image from 'next/image';
import { useMemo } from 'react';

import { chatErrorText } from '@/lib/chat-transport';
import { STRATEGIST_DESK_LIST, type StrategistDeskConfig } from '@/lib/kestrel-strategist-desks';

export function ChatErrorBanner({ error }: { error: Error }) {
  return (
    <div
      role="alert"
      className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 font-mono text-xs text-rose-400"
    >
      <span>{chatErrorText(error)}</span>
    </div>
  );
}

export function ChatEmptyState({
  pinnedSymbol,
  disabled,
  onSelect,
}: {
  pinnedSymbol: Symbol | null;
  disabled?: boolean;
  onSelect: (text: string) => void;
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
    <div className="relative flex min-h-[68svh] flex-col items-center justify-center gap-6 px-4 py-8 select-none">
      {/* ── Background Neoclassical Engraving Watermark ── */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center opacity-10 mix-blend-luminosity overflow-hidden"
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

      {/* ── Council Chamber Pediment Header ── */}
      <div className="relative z-10 flex w-full max-w-3xl flex-col items-center text-center">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-3 py-1 font-mono text-[10px] font-semibold tracking-[0.18em] text-[#D4AF37] uppercase">
          <IconSparkles className="size-3" />
          <span>INSTITUTIONAL COUNCIL CHAMBER</span>
        </div>

        <h2 className="font-display text-2xl font-normal tracking-[-0.03em] text-[#F4F1EA] sm:text-3xl lg:text-4xl">
          Convene the{' '}
          <span className="font-serif italic text-[#D4AF37]">Council of Strategists</span>
        </h2>

        <p className="mt-2 max-w-xl text-xs leading-relaxed text-[#F4F1EA]/70 sm:text-sm">
          Select an autonomous specialist desk for targeted micro-analysis or commission the
          unified four-desk council for cross-asset synthesis and execution planning.
        </p>
      </div>

      {/* ── 4 Strategist Desk Quick-Launch Cards ── */}
      <div className="relative z-10 grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STRATEGIST_DESK_LIST.map((desk) => (
          <DeskQuickCard
            key={desk.id}
            desk={desk}
            disabled={disabled}
            onSelect={() => onSelect(desk.defaultPrompt)}
          />
        ))}
      </div>

      {/* ── Quick Prompt Affirmation Chips ── */}
      <div className="relative z-10 flex w-full max-w-3xl flex-col items-center gap-2 pt-2">
        <span className="font-mono text-[10px] font-semibold tracking-wider text-[#F4F1EA]/50 uppercase">
          Or dispatch a direct market query
        </span>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(prompt)}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#F4F1EA]/10 bg-[#111114] px-3 py-1.5 font-mono text-xs text-[#F4F1EA]/80 transition-all hover:border-[#D4AF37]/40 hover:text-[#D4AF37] active:translate-y-[0.5px] disabled:pointer-events-none disabled:opacity-50"
            >
              <span className="text-[#D4AF37]">›</span>
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
      className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-[#F4F1EA]/10 bg-[#111114] p-3.5 text-left transition-all duration-200 hover:border-[#D4AF37]/40 hover:bg-[#16161A] active:translate-y-[0.5px] disabled:pointer-events-none disabled:opacity-50"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-3 -right-3 z-0 size-20 opacity-10 transition-opacity group-hover:opacity-25 mix-blend-luminosity"
      >
        <Image src={desk.artworkPath} alt="" fill unoptimized className="object-contain" />
      </div>

      <div className="relative z-10 flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[9px] font-semibold tracking-wider text-[#D4AF37] uppercase">
            {desk.code}
          </span>
          <span className="size-1.5 rounded-full" style={{ backgroundColor: desk.accentColor }} />
        </div>
        <div className="font-display text-sm font-normal text-[#F4F1EA]">{desk.title}</div>
        <div className="font-serif text-xs italic text-[#F4F1EA]/60">&ldquo;{desk.epithet}&rdquo;</div>
      </div>

      <div className="relative z-10 mt-3 flex items-center justify-between border-t border-[#F4F1EA]/5 pt-2 font-mono text-[11px] text-[#F4F1EA]/60 group-hover:text-[#D4AF37]">
        <span>Deploy Desk</span>
        <IconArrowRight className="size-3 text-[#D4AF37] transition-transform group-hover:translate-x-0.5" />
      </div>
    </button>
  );
}
