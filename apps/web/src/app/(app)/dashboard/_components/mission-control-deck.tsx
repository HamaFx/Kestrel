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
//
// The live status metrics (session, open risk, alert pulse, AI nudge) live in
// `TodayGlanceWidget` — this deck previously repeated them in a second
// telemetry strip, so one screen showed the same four values twice.
import { IconArrowRight } from '@tabler/icons-react';
import Image from 'next/image';
import Link from 'next/link';

import { STRATEGIST_DESK_LIST } from '@/lib/kestrel-strategist-desks';

import { StrategistDeskCard } from './strategist-desk-card';

export function MissionControlDeck() {
  return (
    <section
      aria-label="Mission Control Deck"
      className="relative mb-2 flex flex-col gap-4 overflow-hidden rounded-2xl"
    >
      {/* ── 1. Archival Pediment Header Banner ── */}
      <div className="bg-bg-elev-1/90 relative flex flex-col justify-between overflow-hidden rounded-xl border border-white/[0.08] p-5 shadow-md backdrop-blur-md sm:p-6 md:flex-row md:items-center">
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
            <span className="text-brand font-mono text-[11px] font-semibold tracking-[0.18em] uppercase">
              INSTITUTIONAL MULTI-AGENT COMMAND DECK
            </span>
            <span className="bg-brand size-1.5 animate-pulse rounded-full" />
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
            className="border-brand/60 bg-brand inline-flex items-center gap-2 rounded-lg border px-4 py-2 font-mono text-xs font-semibold tracking-wider text-white uppercase shadow-md transition-all hover:brightness-110 active:translate-y-[0.5px]"
          >
            <span>Convene Full Council</span>
            <IconArrowRight className="size-3.5" />
          </Link>
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
