'use client';

// SPDX-License-Identifier: Apache-2.0

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

// Landing desks section shell: owns the auto-cycling/pause-on-hover state and
// composes the 2-pane milled instrument frame (selector rail + active console).
import { useEffect, useRef, useState } from 'react';

import { BlueprintPlate } from '@/components/brand/blueprint-plates';

import { DeskConsole } from './desk-console';
import { DeskTabs } from './desk-tabs';
import { CYCLE_DURATION_MS, DESKS } from './desks';

export function LandingDesks() {
  const [selectedId, setSelectedId] = useState<string>('technical');
  const [isPaused, setIsPaused] = useState(false);
  const activeDesk = DESKS.find((d) => d.id === selectedId) ?? DESKS[0]!;
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-cycling tabs with pause on hover
  useEffect(() => {
    if (isPaused) return;

    timerRef.current = setTimeout(() => {
      setSelectedId((current) => {
        const idx = DESKS.findIndex((d) => d.id === current);
        const nextIdx = (idx + 1) % DESKS.length;
        return DESKS[nextIdx]!.id;
      });
    }, CYCLE_DURATION_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [selectedId, isPaused]);

  const handleSelectDesk = (id: string) => {
    setSelectedId(id);
    setIsPaused(true);
  };

  return (
    <section
      id="desks"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className="relative overflow-hidden border-t border-white/[0.06] bg-[#101112] py-16 sm:py-20 lg:py-24"
    >
      {/* Ambient 4-Strategist Council engraving framing the top-right */}
      <div
        aria-hidden="true"
        className="desks-backdrop-mask pointer-events-none absolute top-4 right-0 z-0 h-[240px] w-[70%] opacity-15 mix-blend-screen select-none sm:top-6 sm:h-[320px] sm:w-[58%] lg:top-6 lg:right-4 lg:h-[420px] lg:w-[40%] lg:opacity-20"
      >
        <BlueprintPlate
          id="sentinel"
          showRasterBackup
          variant="watermark"
          className="h-full w-full"
        />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mb-10 flex flex-col gap-4 sm:mb-12 md:flex-row md:items-end md:justify-between">
          <div className="flex max-w-2xl flex-col items-start gap-3">
            <div className="border-border/60 inline-flex items-center gap-2 rounded-full border bg-white/[0.03] px-3 py-1 font-mono text-xs">
              <span className="bg-brand size-2 rounded-full" />
              <span className="text-brand font-semibold tracking-wider uppercase">
                Four AI Minds · One Clear Verdict
              </span>
            </div>

            <h2 className="font-display text-fg text-3xl font-normal tracking-[-0.03em] sm:text-4xl lg:text-5xl">
              FOUR SPECIALISTS{' '}
              <span className="font-redaction-35 text-brand italic">In Your Corner</span>
            </h2>
            <p className="text-fg-muted font-sans text-sm leading-relaxed sm:text-base">
              Why trust a single AI prompt that guesses blindly? Kestrel puts four specialized
              analysts on every setup—checking trend, breaking news, 1% risk rules, and whale
              positioning at the same time.
            </p>
          </div>

          <div className="text-fg-subtle hidden items-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.02] px-3.5 py-2 font-mono text-xs lg:flex">
            <span className="bg-bull size-2 rounded-full" />
            <span>WORKING IN PARALLEL</span>
          </div>
        </div>

        {/* Unified 2-Pane Milled Instrument Frame */}
        <div className="grid overflow-hidden rounded-2xl border border-white/10 bg-[#121315] divide-y divide-white/[0.08] lg:grid-cols-12 lg:divide-x lg:divide-y-0">
          <DeskTabs selectedId={selectedId} isPaused={isPaused} onSelect={handleSelectDesk} />

          {/* Right Console: Active Desk Briefing Cockpit */}
          <div className="flex min-w-0 flex-col lg:col-span-7">
            <DeskConsole desk={activeDesk} />
          </div>
        </div>
      </div>
    </section>
  );
}
