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

// "The Unfair Advantage" section (#simulator). Contrasts emotional solo
// retail trading against Kestrel's 4-Desk War Room and showcases a clean,
// verified 1:3.64 R:R London Breakout setup without multi-stage sandbox clutter.
import { IconCheck, IconShieldCheck, IconX } from '@tabler/icons-react';

import { BlueprintPlate } from '@/components/brand/blueprint-plates';

import { SCENARIOS } from './scenarios';
import { SimulatorSetupChart } from './simulator-setup-chart';

const EDGE_CONTRASTS = [
  {
    solo: 'Chasing 5-minute candles after the move already happened',
    kestrel: 'Waiting for 4H liquidity sweeps and session structure alignment',
  },
  {
    solo: 'Trading Gold blind right into a Treasury yield spike or Fed print',
    kestrel: 'Live US10Y, DXY, and macro catalyst cross-check on every setup',
  },
  {
    solo: 'Guessing lot sizes and widening stops when a trade goes red',
    kestrel: 'Hard ≤ 1.0% equity risk cap and 1:3+ R:R floor enforced upfront',
  },
  {
    solo: 'Forcing weak setups out of boredom or revenge trading',
    kestrel: 'Ruthless automatic veto whenever the 4 desks do not align',
  },
] as const;

export function LandingSimulator() {
  const featuredScenario = SCENARIOS[0]!;

  return (
    <section
      id="simulator"
      className="relative overflow-hidden border-b border-white/[0.08] bg-[#121212] py-28 lg:py-36"
    >
      {/* Chiaroscuro astrolabe sculpture backdrop */}
      <div
        aria-hidden="true"
        className="simulator-backdrop-mask pointer-events-none absolute top-6 right-0 z-0 h-[340px] w-[88%] opacity-38 mix-blend-screen select-none sm:h-[440px] sm:w-[72%] lg:top-0 lg:right-0 lg:h-[86%] lg:w-[50%] lg:opacity-48"
      >
        <BlueprintPlate id="astrolabe" variant="backdrop" className="h-full w-full" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Spacious Section Header */}
        <div className="mb-16 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <div className="text-brand mb-3 font-mono text-xs font-semibold tracking-[0.14em] uppercase">
              02 · THE UNFAIR ADVANTAGE
            </div>
            <h2 className="font-display text-fg text-3xl font-normal tracking-[-0.02em] sm:text-5xl">
              Stop Trading on Emotion.{' '}
              <span className="font-redaction-35 text-brand italic">Trade With a War Room.</span>
            </h2>
          </div>
          <p className="text-fg-muted max-w-md font-sans text-base leading-relaxed">
            Most traders don&apos;t fail because their chart reading is bad—they fail because they
            enter late, size on impulse, and ignore macro headwinds.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-stretch lg:gap-10">
          {/* Left 5 Columns: Solo Retail Trap vs. The Kestrel Standard */}
          <div className="flex flex-col justify-between rounded-2xl border border-white/[0.08] bg-[#141517]/85 p-7 backdrop-blur-md sm:p-9 lg:col-span-5">
            <div>
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-4 font-mono text-xs">
                <span className="text-fg-subtle uppercase">DISCIPLINE AUDIT</span>
                <span className="text-brand font-bold uppercase">SOLO VS. 4-DESK COUNCIL</span>
              </div>

              <div className="mt-6 divide-y divide-white/[0.07]">
                {EDGE_CONTRASTS.map((item) => (
                  <div key={item.kestrel} className="py-4 first:pt-0 last:pb-0">
                    <div className="text-fg-subtle flex items-start gap-2.5 font-sans text-xs line-through decoration-white/25">
                      <IconX className="text-bear mt-0.5 size-3.5 shrink-0" />
                      <span>{item.solo}</span>
                    </div>
                    <div className="text-fg mt-2 flex items-start gap-2.5 font-sans text-sm font-medium">
                      <IconCheck className="text-bull mt-0.5 size-4 shrink-0" />
                      <span>{item.kestrel}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 border-t border-white/[0.08] pt-5 font-mono text-xs">
              <div className="flex items-center justify-between">
                <span className="text-fg-subtle">DEFAULT RISK CEILING</span>
                <span className="text-bull font-bold tabular-nums">≤ 1.00% EQUITY</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-fg-subtle">MINIMUM PAYOFF FLOOR</span>
                <span className="text-brand font-bold tabular-nums">1 : 3.00+ R:R</span>
              </div>
            </div>
          </div>

          {/* Right 7 Columns: Iconic Verified Setup Showcase */}
          <div className="surface-panel relative flex flex-col justify-between overflow-hidden rounded-2xl border border-white/12 bg-[#141517]/95 p-7 shadow-2xl sm:p-9 lg:col-span-7">
            <BlueprintPlate
              id="astrolabe"
              variant="watermark"
              className="pointer-events-none absolute -top-8 -right-8 z-0 size-56 opacity-20"
            />

            <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
              <div className="flex items-center gap-2.5">
                <IconShieldCheck className="text-brand size-4" />
                <span className="text-fg font-mono text-xs font-bold tracking-[0.12em] uppercase">
                  {featuredScenario.symbol} · {featuredScenario.name}
                </span>
              </div>
              <span className="border-bull/35 bg-bull/10 text-bull rounded border px-2.5 py-1 font-mono text-[11px] font-bold tabular-nums">
                4/4 VERIFIED · {featuredScenario.rr} R:R
              </span>
            </div>

            <div className="relative z-10 my-6">
              <SimulatorSetupChart scenario={featuredScenario} stage="complete" isVetoed={false} />
            </div>

            <div className="relative z-10 grid grid-cols-2 gap-4 border-t border-white/[0.08] pt-5 font-mono text-xs tabular-nums sm:grid-cols-4 sm:divide-x sm:divide-white/[0.08]">
              <div>
                <span className="text-fg-subtle block text-[10px] uppercase">ENTRY LIMIT</span>
                <span className="text-fg mt-1 block text-sm font-bold">
                  {featuredScenario.entry}
                </span>
              </div>
              <div className="sm:pl-4">
                <span className="text-fg-subtle block text-[10px] uppercase">STOP (0.85%)</span>
                <span className="text-bear mt-1 block text-sm font-bold">
                  {featuredScenario.invalidation}
                </span>
              </div>
              <div className="sm:pl-4">
                <span className="text-fg-subtle block text-[10px] uppercase">TARGET 1 (40%)</span>
                <span className="text-bull mt-1 block text-sm font-bold">
                  {featuredScenario.target1}
                </span>
              </div>
              <div className="sm:pl-4">
                <span className="text-fg-subtle block text-[10px] uppercase">RUNNER (TP3)</span>
                <span className="text-brand mt-1 block text-sm font-bold">
                  {featuredScenario.target3}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
