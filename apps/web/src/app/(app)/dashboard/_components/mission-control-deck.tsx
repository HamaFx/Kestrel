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

// Institutional command deck for /dashboard: the archival pediment banner with
// the Convene Full Council CTA, and the four strategist desk cards.
// Supports a persisted compact "Quick-Dispatch Strip" mode so daily operators
// can collapse the full pediment banner and bring live widgets above the fold.
import { IconArrowRight, IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import Image from 'next/image';
import Link from 'next/link';

import { useLocalStorage } from '@/hooks/use-local-storage';
import { STRATEGIST_DESK_LIST } from '@/lib/kestrel-strategist-desks';

import { StrategistDeskCard } from './strategist-desk-card';

const DECK_COLLAPSED_KEY = 'kestrel:mission-control-collapsed:v1';

export function MissionControlDeck() {
  const [collapsed, setCollapsed] = useLocalStorage<boolean>(DECK_COLLAPSED_KEY, false);

  if (collapsed) {
    return (
      <section
        aria-label="Mission Control Deck"
        className="surface-panel mb-1 flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-2.5"
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2">
            <span className="bg-brand size-1.5 animate-pulse rounded-full shadow-[0_0_8px_#ff3616]" />
            <span className="label-eyebrow">4-DESK COUNCIL</span>
          </div>

          <div className="bg-border hidden h-3.5 w-px sm:block" aria-hidden="true" />

          <div className="flex flex-wrap items-center gap-1.5">
            {STRATEGIST_DESK_LIST.map((desk) => (
              <Link
                key={desk.id}
                href={`/chat?desk=${desk.id}&prompt=${encodeURIComponent(desk.defaultPrompt)}`}
                className="surface-chip tactile-press text-fg-muted hover:text-fg hover:border-brand/40 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-[11px] font-medium transition-colors"
                title={`${desk.title} — ${desk.epithet}`}
              >
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: desk.accentColor }}
                />
                <span>{desk.title}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/chat?mode=full"
            className="tactile-press border-brand/60 bg-brand inline-flex h-8 items-center gap-1.5 rounded-md border px-3 font-mono text-[11px] font-semibold tracking-wider text-white uppercase shadow-[0_2px_10px_rgba(255,54,22,0.3),inset_0_1px_0_rgba(255,255,255,0.28)] transition-all hover:brightness-110"
          >
            <span>Convene Full Council</span>
            <IconArrowRight className="size-3.5" strokeWidth={2} />
          </Link>

          <button
            type="button"
            onClick={() => setCollapsed(false)}
            aria-label="Expand Mission Control Deck"
            aria-expanded="false"
            className="surface-chip tactile-press text-fg-subtle hover:text-fg inline-flex h-8 items-center gap-1 rounded-md px-2 font-mono text-[11px] transition-colors"
          >
            <span className="hidden sm:inline">Expand</span>
            <IconChevronDown className="size-3.5" strokeWidth={1.75} />
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Mission Control Deck"
      className="relative mb-2 flex flex-col gap-4 overflow-hidden rounded-2xl"
    >
      {/* ── 1. Archival Pediment Header Banner ── */}
      <div className="surface-panel relative flex flex-col justify-between overflow-hidden rounded-xl p-5 sm:p-6 md:flex-row md:items-center">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-12 -right-12 z-0 h-64 w-96 opacity-15 mix-blend-luminosity select-none"
        >
          <Image
            src="/landing/desks-council-strategists.webp"
            alt=""
            fill
            unoptimized
            className="object-contain object-right"
          />
          <div className="via-bg-elev-1/60 to-bg-elev-1 absolute inset-0 bg-gradient-to-l from-transparent" />
        </div>

        <div className="relative z-10 flex max-w-2xl flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="label-eyebrow">INSTITUTIONAL MULTI-AGENT COMMAND DECK</span>
            <span className="bg-brand size-1.5 animate-pulse rounded-full shadow-[0_0_8px_#ff3616]" />
          </div>

          <h2 className="font-display text-fg text-2xl font-normal tracking-[-0.03em] sm:text-3xl">
            The Council of{' '}
            <span className="font-redaction-35 text-brand italic">Four Strategists</span>
          </h2>

          <p className="text-fg-muted max-w-xl text-xs leading-relaxed sm:text-sm">
            Autonomous multi-desk committee operating in parallel. Macro horizon, quant liquidity,
            and mathematical risk governor synthesized by the Arbiter into high-expectancy trade
            directives.
          </p>
        </div>

        <div className="relative z-10 mt-4 flex flex-wrap items-center gap-2.5 md:mt-0 md:flex-col md:items-end">
          {/* `?mode=full` is the valid AnalysisMode the chat cockpit reads —
              `?mode=council` was silently ignored. */}
          <Link
            href="/chat?mode=full"
            className="tactile-press border-brand/60 bg-brand inline-flex h-10 items-center gap-2 rounded-md border px-4 font-mono text-xs font-semibold tracking-wider text-white uppercase shadow-[0_4px_14px_rgba(255,54,22,0.32),inset_0_1px_0_rgba(255,255,255,0.32),inset_0_-1px_0_rgba(0,0,0,0.35)] transition-all hover:brightness-110"
          >
            <span>Convene Full Council</span>
            <IconArrowRight className="size-3.5" strokeWidth={2} />
          </Link>

          <button
            type="button"
            onClick={() => setCollapsed(true)}
            aria-label="Collapse Mission Control Deck to compact strip"
            aria-expanded="true"
            className="text-fg-subtle hover:text-fg inline-flex items-center gap-1 rounded px-2 py-1 font-mono text-[11px] transition-colors"
          >
            <span>Compact strip</span>
            <IconChevronUp className="size-3.5" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {/* ── 2. The Four Strategist Desk Cards (4-Column Grid) ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STRATEGIST_DESK_LIST.map((desk) => (
          <StrategistDeskCard key={desk.id} desk={desk} />
        ))}
      </div>
    </section>
  );
}
