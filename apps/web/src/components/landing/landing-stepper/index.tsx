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

// "The Trading Arsenal" section (#stepper). Replaces the developer-centric
// 3-stage pipeline with 3 high-impact trader capabilities: Backtesting Lab,
// Tick-Level Paper Broker & R-Journal, and 24/7 Telegram War Room Briefings.
import { BlueprintPlate } from '@/components/brand/blueprint-plates';

type ArsenalKind = 'backtest' | 'paper' | 'telegram';

interface ArsenalFeature {
  id: ArsenalKind;
  index: string;
  tag: string;
  title: string;
  summary: string;
  specs: readonly { label: string; value: string }[];
}

const ARSENAL_FEATURES: readonly ArsenalFeature[] = [
  {
    id: 'backtest',
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

function ArsenalOpticalSvg({ kind }: { kind: ArsenalKind }) {
  if (kind === 'backtest') {
    return (
      <svg viewBox="0 0 280 104" className="h-28 w-full select-none" aria-hidden="true">
        <defs>
          <linearGradient id="arsenal-bt-wash" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,54,22,0.22)" />
            <stop offset="100%" stopColor="rgba(18,18,18,0)" />
          </linearGradient>
        </defs>
        <line x1="0" y1="84" x2="280" y2="84" stroke="rgba(255,255,255,0.08)" />
        {/* Baseline parameter sweep curves */}
        <path
          d="M 0 84 C 60 82, 120 74, 180 62 C 220 54, 250 48, 280 44"
          fill="none"
          stroke="rgba(255,255,255,0.16)"
          strokeWidth="1.25"
          strokeDasharray="3 3"
        />
        <path
          d="M 0 84 C 60 78, 120 64, 180 48 C 220 38, 250 32, 280 28"
          fill="none"
          stroke="rgba(255,255,255,0.26)"
          strokeWidth="1.25"
        />
        {/* Winning parameter sweep equity curve */}
        <path
          d="M 0 84 C 54 74, 110 56, 168 38 C 214 24, 248 16, 280 12 L 280 84 L 0 84 Z"
          fill="url(#arsenal-bt-wash)"
        />
        <path
          d="M 0 84 C 54 74, 110 56, 168 38 C 214 24, 248 16, 280 12"
          fill="none"
          stroke="#ff3616"
          strokeWidth="2"
        />
        <circle cx="168" cy="38" r="3.5" fill="#ff3616" />
        <circle cx="276" cy="12" r="3.5" fill="#3f9e3d" />
      </svg>
    );
  }

  if (kind === 'paper') {
    return (
      <svg viewBox="0 0 280 104" className="h-28 w-full select-none" aria-hidden="true">
        <defs>
          <linearGradient id="arsenal-paper-wash" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(63,158,61,0.22)" />
            <stop offset="100%" stopColor="rgba(18,18,18,0)" />
          </linearGradient>
        </defs>
        <line x1="0" y1="84" x2="280" y2="84" stroke="rgba(255,255,255,0.08)" />
        {/* Stepwise R-Multiple Expectancy Ladder */}
        <path
          d="M 0 84 L 46 84 L 46 66 L 98 66 L 98 72 L 148 72 L 148 44 L 208 44 L 208 22 L 280 22 L 280 84 Z"
          fill="url(#arsenal-paper-wash)"
        />
        <path
          d="M 0 84 L 46 84 L 46 66 L 98 66 L 98 72 L 148 72 L 148 44 L 208 44 L 208 22 L 280 22"
          fill="none"
          stroke="#3f9e3d"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <circle cx="46" cy="66" r="3" fill="#3f9e3d" />
        <circle cx="148" cy="44" r="3" fill="#3f9e3d" />
        <circle cx="208" cy="22" r="3.5" fill="#3f9e3d" />
      </svg>
    );
  }

  // kind === 'telegram'
  return (
    <svg viewBox="0 0 280 104" className="h-28 w-full select-none" aria-hidden="true">
      <line x1="0" y1="52" x2="280" y2="52" stroke="rgba(255,255,255,0.08)" strokeDasharray="2 4" />
      <circle cx="140" cy="52" r="42" fill="none" stroke="rgba(255,54,22,0.16)" strokeWidth="1" />
      <circle cx="140" cy="52" r="26" fill="none" stroke="rgba(255,54,22,0.32)" strokeWidth="1.25" />
      <circle cx="140" cy="52" r="10" fill="rgba(255,54,22,0.2)" />
      <circle cx="140" cy="52" r="4" fill="#ff3616" />
      {/* Outbound dispatch rays */}
      <line x1="140" y1="52" x2="228" y2="24" stroke="#ff3616" strokeWidth="1.5" />
      <line x1="140" y1="52" x2="236" y2="52" stroke="#3f9e3d" strokeWidth="1.5" />
      <line x1="140" y1="52" x2="228" y2="80" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
      <circle cx="228" cy="24" r="3.5" fill="#ff3616" />
      <circle cx="236" cy="52" r="3.5" fill="#3f9e3d" />
      <circle cx="228" cy="80" r="3" fill="#e5e5e5" />
    </svg>
  );
}

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

                <div className="my-8 border-y border-white/[0.05] py-4">
                  <ArsenalOpticalSvg kind={feature.id} />
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
