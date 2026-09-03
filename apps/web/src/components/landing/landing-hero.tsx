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

import { Link } from 'next-view-transitions';
import Image from 'next/image';
import { motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { ChartWizardSprite, MacroMageSprite, RiskKnightSprite, KestrelFalconSprite } from '@/components/chat/parts/pixel-desk/pixel-sprites';

export function LandingHero() {
  return (
    <section className="relative min-h-[90vh] overflow-hidden pt-12 pb-24 lg:pt-20 lg:pb-32">
      {/* ── Hoplite Bottom-Up Ember Heat Gradient ── */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 select-none opacity-90"
        style={{
          background:
            'radial-gradient(ellipse 70% 190% at 85% 100%, #ff3616 0%, rgba(255, 54, 22, 0.22) 35%, rgba(255, 54, 22, 0.05) 60%, transparent 75%)',
        }}
      />

      {/* Halftone Texture Overlay */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(#ffffff0a_1px,transparent_1px)] [background-size:16px_16px] opacity-40"
      />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-12 lg:items-center lg:gap-8">
          {/* Left Column: Monumental Headline & Value Prop */}
          <div className="flex flex-col items-start gap-6 lg:col-span-7">
            {/* Predator Badge */}
            <div className="inline-flex items-center gap-2.5 rounded-full border border-brand/30 bg-brand/10 px-3.5 py-1.5 shadow-[0_0_16px_rgba(255,54,22,0.15)]">
              <img src="/brand/kestrel-falcon.svg" alt="" className="size-4 text-brand" aria-hidden="true" />
              <span className="font-mono text-xs font-semibold tracking-wider text-brand uppercase">
                Sovereign Intelligence Engine
              </span>
            </div>

            {/* Monumental Headline */}
            <h1 className="font-display text-4xl leading-[1.08] font-normal tracking-[-0.03em] text-fg sm:text-6xl lg:text-[68px]">
              THE APEX AI COMMITTEE FOR{' '}
              <span className="font-redaction-35 italic text-brand tracking-normal">
                Institutional
              </span>{' '}
              GOLD & FOREX
            </h1>

            {/* Subtitle */}
            <p className="max-w-2xl font-sans text-base leading-relaxed text-fg-muted sm:text-lg sm:leading-normal">
              Four autonomous specialist desks synthesize price action structure, macro rate catalysts, 1% risk governance, and institutional COT positioning into a unified, high-conviction market verdict.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <Link href="/login">
                <Button variant="tactical" size="lg" className="px-6 text-base font-semibold">
                  Launch Terminal
                </Button>
              </Link>
              <a href="#desks">
                <Button variant="secondary" size="lg" className="px-5 text-sm font-medium">
                  Explore 4 Desks
                </Button>
              </a>
            </div>

            {/* Social Proof / Metrics strip */}
            <div className="grid grid-cols-3 gap-6 pt-6 border-t border-white/10 w-full max-w-lg">
              <div>
                <div className="font-mono text-2xl font-bold tracking-tight text-fg tabular-nums">
                  4 Desks
                </div>
                <div className="font-sans text-xs text-fg-subtle">Autonomous Syndicate</div>
              </div>
              <div>
                <div className="font-mono text-2xl font-bold tracking-tight text-brand tabular-nums">
                  1:3+ R:R
                </div>
                <div className="font-sans text-xs text-fg-subtle">Mathematical Floor</div>
              </div>
              <div>
                <div className="font-mono text-2xl font-bold tracking-tight text-fg tabular-nums">
                  0.0%
                </div>
                <div className="font-sans text-xs text-fg-subtle">Custodial Exposure</div>
              </div>
            </div>
          </div>

          {/* Right Column: Interactive Hardware Telemetry Rig */}
          <div className="lg:col-span-5">
            <div className="surface-panel relative overflow-hidden rounded-2xl border border-white/15 bg-[#141414]/90 p-5 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.15)]">
              {/* Header Status */}
              <div className="flex items-center justify-between border-b border-white/10 pb-3.5">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full bg-bull animate-pulse shadow-[0_0_8px_#3f9e3d]" />
                  <span className="font-mono text-xs font-bold tracking-wider text-fg uppercase">
                    XAU/USD · DELIBERATION RIG
                  </span>
                </div>
                <span className="font-mono text-xs text-brand font-semibold bg-brand/10 border border-brand/20 px-2 py-0.5 rounded-md">
                  SYNCHRONIZED
                </span>
              </div>

              {/* Price Display */}
              <div className="my-4 rounded-xl surface-well p-4 border border-white/5 bg-[#0e0e0e]">
                <div className="flex items-baseline justify-between">
                  <span className="font-sans text-xs text-fg-subtle uppercase tracking-wider">
                    Spot Gold / U.S. Dollar
                  </span>
                  <span className="font-mono text-xs text-bull font-semibold">
                    ▲ +1.42% (+9.80)
                  </span>
                </div>
                <div className="mt-1 font-mono text-3xl font-bold tracking-tight text-fg tabular-nums">
                  2,864.20
                </div>
              </div>

              {/* 4 Hardware Specialist Desks Row */}
              <div className="grid grid-cols-4 gap-2 py-2">
                {/* Tech */}
                <div className="flex flex-col items-center gap-1.5 p-2 rounded-lg bg-white/[0.03] border border-white/5">
                  <ChartWizardSprite isThinking bias="bullish" />
                  <span className="font-mono text-[10px] font-bold text-bull uppercase">Tech</span>
                  <span className="font-mono text-[9px] text-fg-subtle">FVG +92%</span>
                </div>

                {/* Macro */}
                <div className="flex flex-col items-center gap-1.5 p-2 rounded-lg bg-white/[0.03] border border-white/5">
                  <MacroMageSprite isDone bias="bullish" />
                  <span className="font-mono text-[10px] font-bold text-info uppercase">Macro</span>
                  <span className="font-mono text-[9px] text-fg-subtle">Yields -4bp</span>
                </div>

                {/* Risk */}
                <div className="flex flex-col items-center gap-1.5 p-2 rounded-lg bg-white/[0.03] border border-white/5">
                  <RiskKnightSprite isDone bias="bullish" />
                  <span className="font-mono text-[10px] font-bold text-warn uppercase">Risk</span>
                  <span className="font-mono text-[9px] text-fg-subtle">1% @ 2,846</span>
                </div>

                {/* Sentinel */}
                <div className="flex flex-col items-center gap-1.5 p-2 rounded-lg bg-white/[0.03] border border-white/5">
                  <KestrelFalconSprite isDone bias="bullish" />
                  <span className="font-mono text-[10px] font-bold text-brand uppercase">Syndicate</span>
                  <span className="font-mono text-[9px] text-fg-subtle">LONG 88%</span>
                </div>
              </div>

              {/* Consensus Trade Card */}
              <div className="mt-3 rounded-lg border border-brand/30 bg-brand/[0.08] p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs font-bold text-fg uppercase">Committee Order Plan</span>
                  </div>
                  <span className="font-mono text-xs font-bold text-bull bg-bull/20 border border-bull/40 px-2 py-0.5 rounded-sm uppercase">
                    BUY / LONG
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 font-mono text-xs tabular-nums text-center">
                  <div className="rounded surface-well p-1.5 bg-[#0a0a0a]">
                    <span className="text-[10px] text-fg-subtle block">ENTRY</span>
                    <span className="font-bold text-fg">2,864.00</span>
                  </div>
                  <div className="rounded surface-well p-1.5 bg-[#0a0a0a]">
                    <span className="text-[10px] text-bear block">INVALIDATION</span>
                    <span className="font-bold text-bear">2,846.50</span>
                  </div>
                  <div className="rounded surface-well p-1.5 bg-[#0a0a0a]">
                    <span className="text-[10px] text-bull block">TARGET (1:3)</span>
                    <span className="font-bold text-bull">2,916.50</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
