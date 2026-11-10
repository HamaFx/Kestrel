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

// "18 Markets. Zero Subscription Tax." section (#architecture). Replaces
// developer database/cache jargon with the 18-instrument coverage matrix and
// the BYOK ownership advantage (~$0.03 per briefing vs $199/mo signal rooms).
import { IconCheck, IconKey } from '@tabler/icons-react';

import { BlueprintPlate } from '@/components/brand/blueprint-plates';
import { TacticalFlameButton } from '@/components/landing/landing-button';

const MARKET_DESKS = [
  {
    category: 'BULLION & MACRO BENCHMARKS',
    note: 'Real-Time Yield & Dollar Cross-Check',
    symbols: ['XAU/USD (Spot Gold)', 'US10Y Yield', 'US02Y Yield', 'DXY Dollar Index'],
  },
  {
    category: '11 MAJOR & CROSS FOREX PAIRS',
    note: 'London, New York & Tokyo Session Coverage',
    symbols: [
      'EUR/USD',
      'GBP/USD',
      'USD/JPY',
      'AUD/USD',
      'USD/CAD',
      'USD/CHF',
      'NZD/USD',
      'EUR/GBP',
      'EUR/JPY',
      'GBP/JPY',
      'AUD/JPY',
    ],
  },
  {
    category: '6 HIGH-LIQUIDITY CRYPTO PAIRS',
    note: '24/7 Perpetual & Spot Structure',
    symbols: ['BTC/USD', 'ETH/USD', 'SOL/USD', 'BNB/USD', 'XRP/USD', 'ADA/USD'],
  },
] as const;

const BYOK_ADVANTAGES = [
  'Plug in OpenAI, Claude, Gemini, or OpenRouter in 30 seconds',
  'Pay raw provider API cost (~$0.03 per full 4-desk briefing)',
  'Set a hard daily or monthly dollar ceiling so spend never spikes',
  '100% private and non-custodial—your strategies stay on your machine',
] as const;

export function LandingArchitecture() {
  return (
    <section
      id="architecture"
      className="relative overflow-hidden border-b border-white/[0.08] bg-[#121212] py-28 lg:py-36"
    >
      {/* Chiaroscuro Titan sculpture backdrop */}
      <div
        aria-hidden="true"
        className="architecture-backdrop-mask pointer-events-none absolute top-0 right-0 z-0 h-[340px] w-[88%] opacity-38 mix-blend-screen select-none sm:h-[440px] sm:w-[72%] lg:h-[640px] lg:w-[54%] lg:opacity-48"
      >
        <BlueprintPlate id="titan" variant="backdrop" className="h-full w-full" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Spacious Section Header */}
        <div className="mb-16 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <div className="text-brand mb-3 font-mono text-xs font-semibold tracking-[0.14em] uppercase">
              04 · 18 MARKETS · ZERO SUBSCRIPTION TAX
            </div>
            <h2 className="font-display text-fg text-3xl font-normal tracking-[-0.02em] sm:text-5xl">
              Own Your Desk.{' '}
              <span className="font-redaction-35 text-brand italic">
                Kill the $199/mo Subscription.
              </span>
            </h2>
          </div>
          <p className="text-fg-muted max-w-md font-sans text-base leading-relaxed">
            Stop paying monthly markups for black-box signal rooms. Bring your own AI key and run
            institutional research across 18 global markets for pennies.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-stretch lg:gap-10">
          {/* Left 7 Columns: 18-Market Coverage Matrix */}
          <div className="flex flex-col justify-between divide-y divide-white/[0.08] rounded-2xl border border-white/[0.08] bg-[#141517]/85 p-7 backdrop-blur-md sm:p-9 lg:col-span-7">
            {MARKET_DESKS.map((group) => (
              <div key={group.category} className="py-6 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-brand font-mono text-xs font-bold tracking-wider uppercase">
                    {group.category}
                  </span>
                  <span className="text-fg-subtle font-sans text-xs">{group.note}</span>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {group.symbols.map((sym, idx) => (
                    <span
                      key={sym}
                      className={`rounded-lg border px-3 py-1.5 font-mono text-xs font-semibold ${
                        idx === 0 && group.category.startsWith('BULLION')
                          ? 'border-brand/40 bg-brand/15 text-brand'
                          : 'text-fg border-white/[0.08] bg-white/[0.03]'
                      }`}
                    >
                      {sym}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Right 5 Columns: BYOK Economics Card */}
          <div className="surface-panel relative flex flex-col justify-between overflow-hidden rounded-2xl border border-white/12 bg-[#141517]/95 p-7 shadow-2xl sm:p-9 lg:col-span-5">
            <BlueprintPlate
              id="titan"
              variant="watermark"
              className="pointer-events-none absolute -right-8 -bottom-8 z-0 size-56 opacity-20"
            />

            <div className="relative z-10">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-4 font-mono text-xs">
                <span className="text-brand flex items-center gap-2 font-bold uppercase">
                  <IconKey className="size-4" />
                  BRING YOUR OWN KEY (BYOK)
                </span>
                <span className="text-bull font-bold">ZERO MARKUP</span>
              </div>

              <div className="mt-6 flex items-baseline gap-3">
                <span className="font-display text-fg text-5xl font-normal tracking-tight sm:text-6xl">
                  ~$0.03
                </span>
                <span className="text-fg-subtle font-mono text-xs uppercase">
                  / Full 4-Desk Briefing
                </span>
              </div>
              <p className="text-fg-muted mt-2 font-sans text-sm leading-relaxed">
                Compared to $149–$299/month retail trading subscriptions. You pay only for the
                exact tokens you run.
              </p>

              <div className="my-5">
                <BlueprintPlate id="titan" variant="compact" className="h-[168px] w-full" />
              </div>

              <div className="space-y-3 border-t border-white/[0.08] pt-5">
                {BYOK_ADVANTAGES.map((item) => (
                  <div key={item} className="flex items-start gap-2.5 text-sm">
                    <IconCheck className="text-bull mt-0.5 size-4 shrink-0" />
                    <span className="text-fg font-sans">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative z-10 mt-8 border-t border-white/[0.08] pt-6">
              <TacticalFlameButton href="/register" label="Launch Your Desk" className="w-full justify-center" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
