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

// "The Trading Arsenal" section (#stepper). Showcases 3 high-impact trader
// capabilities—Backtesting Lab, Tick-Level Paper Broker & R-Journal, and 24/7
// Telegram War Room Briefings—each paired with its 3-Layer Sovereign Blueprint
// Plate (chiaroscuro engraving + micro-pixel halftone + kinetic CAD reticle).
import { BlueprintPlate, type BlueprintPlateId } from '@/components/brand/blueprint-plates';

interface ArsenalFeature {
  id: string;
  blueprintId: BlueprintPlateId;
  index: string;
  tag: string;
  title: string;
  summary: string;
  specs: readonly { label: string; value: string }[];
}

const ARSENAL_FEATURES: readonly ArsenalFeature[] = [
  {
    id: 'backtest',
    blueprintId: 'colonnade',
    index: '01',
    tag: 'STRATEGY BACKTESTING LAB',
    title: 'Prove Your Edge Before Risking a Dollar',
    summary:
      'Run historical simulations and multi-parameter sweeps across thousands of candles in seconds to uncover your real win rate and drawdown.',
    specs: [
      { label: 'PARAMETER SWEEPS', value: 'Parallel Grid Search' },
      { label: 'METRICS', value: 'Sharpe · Sortino · Max DD' },
    ],
  },
  {
    id: 'paper',
    blueprintId: 'obelisk',
    index: '02',
    tag: 'PAPER BROKER & R-JOURNAL',
    title: 'Practice Live & Track Every R-Multiple',
    summary:
      'Test setups on a live tick-evaluated virtual broker and log every trade to your private Journal with automatic expectancy curves.',
    specs: [
      { label: 'EXECUTION', value: 'Live Tick SL / TP Fills' },
      { label: 'ANALYTICS', value: 'R-Multiple Equity Curve' },
    ],
  },
  {
    id: 'telegram',
    blueprintId: 'eclipse',
    index: '03',
    tag: 'TELEGRAM WAR ROOM & ALERTS',
    title: 'Wake Up Ready for London & New York',
    summary:
      'Receive automated pre-session Gold and Forex briefings plus instant Entry, Stop, and Take-Profit triggers straight to Telegram and mobile.',
    specs: [
      { label: 'BRIEFINGS', value: 'London & NY Open Dossiers' },
      { label: 'TRIGGERS', value: 'Telegram · Web Push · Email' },
    ],
  },
];

export function LandingStepper() {
  return (
    <section
      id="stepper"
      className="relative overflow-hidden border-b border-white/[0.08] bg-[#121212] py-28 lg:py-36"
    >
      {/* Chiaroscuro colonnade sculpture backdrop */}
      <div
        aria-hidden="true"
        className="stepper-backdrop-mask pointer-events-none absolute top-6 left-0 z-0 h-[340px] w-[88%] opacity-38 mix-blend-screen select-none sm:h-[440px] sm:w-[72%] lg:top-0 lg:left-0 lg:h-[86%] lg:w-[50%] lg:opacity-48"
      >
        <BlueprintPlate id="colonnade" variant="backdrop" className="h-full w-full" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Spacious Section Header */}
        <div className="mb-16 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <div className="text-brand mb-3 font-mono text-xs font-semibold tracking-[0.14em] uppercase">
              03 · THE TRADING ARSENAL
            </div>
            <h2 className="font-display text-fg text-3xl font-normal tracking-[-0.02em] sm:text-5xl">
              More Than a Signal.{' '}
              <span className="font-redaction-35 text-brand italic">A Complete Desk.</span>
            </h2>
          </div>
          <p className="text-fg-muted max-w-md font-sans text-base leading-relaxed">
            Everything you need to stress-test a strategy, practice live execution risk-free, and
            catch high-conviction setups on your phone.
          </p>
        </div>

        {/* 3-Column Feature Showcase Grid */}
        <div className="grid grid-cols-1 divide-y divide-white/[0.08] rounded-2xl border border-white/[0.08] bg-[#141517]/85 backdrop-blur-md lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          {ARSENAL_FEATURES.map((feature) => (
            <article
              key={feature.id}
              className="flex flex-col justify-between p-8 transition-colors duration-200 hover:bg-white/[0.015] sm:p-10"
            >
              <div>
                <div className="flex items-center justify-between font-mono text-xs">
                  <span className="text-brand font-bold tracking-wider">
                    {feature.index} // {feature.tag}
                  </span>
                </div>

                {/* 3-Layer Sovereign Blueprint Plate (Chiaroscuro + Kinetic CAD Reticle + Telemetry) */}
                <div className="my-7">
                  <BlueprintPlate
                    id={feature.blueprintId}
                    variant="showcase"
                    className="h-[224px] w-full"
                  />
                </div>

                <h3 className="font-display text-fg text-2xl font-normal tracking-tight sm:text-3xl">
                  {feature.title}
                </h3>
                <p className="text-fg-muted mt-3 font-sans text-sm leading-relaxed sm:text-base">
                  {feature.summary}
                </p>
              </div>

              <div className="mt-8 divide-y divide-white/[0.06] border-t border-white/[0.08] font-mono text-xs">
                {feature.specs.map((spec) => (
                  <div key={spec.label} className="flex items-center justify-between py-3">
                    <span className="text-fg-subtle text-[11px] uppercase">{spec.label}</span>
                    <span className="text-fg font-semibold">{spec.value}</span>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
