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
// composes the desk selector rail with the active desk console.
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

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
      className="relative overflow-hidden border-t border-white/5 bg-[#101112] py-16 sm:py-20 lg:py-24"
    >
      {/* ── Neoclassical Cybernetic 4-Strategist Council Artwork ── */}
      <div
        aria-hidden="true"
        className="desks-backdrop-mask pointer-events-none absolute top-4 left-0 z-0 h-[360px] w-full opacity-20 mix-blend-screen select-none sm:top-8 sm:h-[480px] lg:top-1/2 lg:h-[88%] lg:w-[48%] lg:-translate-y-1/2 lg:opacity-25"
      >
        <Image
          src="/landing/desks-council-strategists.webp"
          alt="The Four Specialist Desks Neoclassical Strategist Council"
          fill
          unoptimized
          sizes="(max-width: 1024px) 100vw, 48vw"
          className="object-contain object-top lg:object-cover lg:object-center"
        />
      </div>

      {/* Background Radial Glow */}
      <div
        aria-hidden="true"
        className="bg-brand/5 pointer-events-none absolute -top-40 right-0 size-[600px] rounded-full blur-[120px] select-none"
      />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mb-10 flex flex-col gap-4 sm:mb-12 md:flex-row md:items-end md:justify-between">
          <div className="flex max-w-2xl flex-col items-start gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-xs">
              <span className="bg-brand size-2 animate-pulse rounded-full" />
              <span className="text-brand font-semibold tracking-wider uppercase">
                Autonomous Syndicate
              </span>
            </div>

            <h2 className="font-display text-fg text-3xl font-normal tracking-[-0.03em] sm:text-4xl lg:text-5xl">
              THE 4 SPECIALIST DESKS{' '}
              <span className="font-redaction-35 text-brand italic">Deliberating In Sync</span>
            </h2>
            <p className="text-fg-muted font-sans text-sm leading-relaxed sm:text-base">
              Unlike single-prompt trading bots that make emotional decisions, Kestrel operates as
              an institutional multi-desk trading committee. Each specialist evaluates markets from
              an independent mathematical lens.
            </p>
          </div>

          {/* Syndicate Synchronization Telemetry Badge */}
          <div className="text-fg-subtle hidden items-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.02] px-3.5 py-2 font-mono text-xs lg:flex">
            <span className="bg-bull size-2 animate-pulse rounded-full" />
            <span>4/4 DESKS SYNCHRONIZED</span>
          </div>
        </div>

        {/* Side-by-Side Cockpit Grid */}
        <div className="grid gap-6 lg:grid-cols-12 lg:items-stretch lg:gap-8">
          <DeskTabs selectedId={selectedId} isPaused={isPaused} onSelect={handleSelectDesk} />

          {/* Right Console: Active Desk Briefing Cockpit */}
          <div className="flex flex-col lg:col-span-7">
            <DeskConsole desk={activeDesk} />
          </div>
        </div>
      </div>
    </section>
  );
}
