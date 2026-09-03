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

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/cn';

interface Step {
  id: number;
  label: string;
  tag: string;
  title: string;
  description: string;
  fileName: string;
  codeHighlighted: React.ReactNode;
  latency: string;
}

const STEPS: Step[] = [
  {
    id: 1,
    label: '01',
    tag: 'TICK INGESTION',
    title: 'Multi-Venue Liquidity Sweep',
    description:
      'Sub-second tick ingestion aggregating interbank FX pairs, Spot Gold (XAU), US Treasury yields, and Dollar Index (DXY) into an indexed memory stream.',
    fileName: 'venue_ingestion.ts',
    latency: '14ms',
    codeHighlighted: (
      <>
        <span className="text-[#6c7086]">// 1. Interbank Tick Ingestion Pipeline</span>
        {'\n'}
        <span className="text-[#cba6f7]">await</span> <span className="text-[#89b4fa]">kestrel</span>.
        <span className="text-[#a6e3a1]">ingestVenueFeeds</span>({'{'}
        {'\n'}  <span className="text-[#94e2d5]">symbol</span>: <span className="text-[#a6e3a1]">"XAUUSD"</span>,
        {'\n'}  <span className="text-[#94e2d5]">orderBookDepth</span>: <span className="text-[#a6e3a1]">"interbank-l2"</span>,
        {'\n'}  <span className="text-[#94e2d5]">primaryFeeds</span>: [<span className="text-[#a6e3a1]">"LONDON_FIX"</span>, <span className="text-[#a6e3a1]">"NY_AM_KILLZONE"</span>],
        {'\n'}  <span className="text-[#94e2d5]">macroCorrelations</span>: [<span className="text-[#a6e3a1]">"US10Y"</span>, <span className="text-[#a6e3a1]">"US02Y"</span>, <span className="text-[#a6e3a1]">"DXY"</span>]
        {'\n'}{'}'});
      </>
    ),
  },
  {
    id: 2,
    label: '02',
    tag: 'PARALLEL ENGINES',
    title: '4-Desk Concurrent Deliberation',
    description:
      'Four specialized algorithmic agents spin up in parallel: Technicals scans Fair Value Gaps, Macro reviews central bank catalysts, Risk computes ATR stop-losses, and Sentiment tracks CFTC COT positioning.',
    fileName: 'committee_deliberation.ts',
    latency: '82ms',
    codeHighlighted: (
      <>
        <span className="text-[#6c7086]">// 2. Concurrent 4-Desk Sandbox Execution</span>
        {'\n'}
        <span className="text-[#cba6f7]">const</span> <span className="text-[#f9e2af]">hypotheses</span> = <span className="text-[#cba6f7]">await</span> <span className="text-[#89b4fa]">committee</span>.
        <span className="text-[#a6e3a1]">deliberate</span>({'{'}
        {'\n'}  <span className="text-[#94e2d5]">technical</span>:   <span className="text-[#89b4fa]">scanSMCStructure</span>({'{'} timeframes: [<span className="text-[#a6e3a1]">"15m"</span>, <span className="text-[#a6e3a1]">"1h"</span>, <span className="text-[#a6e3a1]">"4h"</span>] {'}'}),
        {'\n'}  <span className="text-[#94e2d5]">macro</span>:       <span className="text-[#89b4fa]">parseRateCatalysts</span>({'{'} wires: [<span className="text-[#a6e3a1]">"FED"</span>, <span className="text-[#a6e3a1]">"PCE"</span>, <span className="text-[#a6e3a1]">"NFP"</span>] {'}'}),
        {'\n'}  <span className="text-[#94e2d5]">risk</span>:        <span className="text-[#89b4fa]">computeCeiling</span>({'{'} maxDrawdown: <span className="text-[#fab387]">0.01</span> {'}'}),
        {'\n'}  <span className="text-[#94e2d5]">sentiment</span>:   <span className="text-[#89b4fa]">queryWhaleCOT</span>({'{'} symbol: <span className="text-[#a6e3a1]">"GOLD"</span> {'}'})
        {'\n'}{'}'});
      </>
    ),
  },
  {
    id: 3,
    label: '03',
    tag: 'SYNDICATE ARBITRATION',
    title: 'Consensus Scoring & Invalidation Veto',
    description:
      'The Lead Arbiter scores weighted desk confidence, tests for contradictory signals (e.g. bullish price action into hawkish Fed print), and enforces mathematical vetoes.',
    fileName: 'arbitration_veto.ts',
    latency: '44ms',
    codeHighlighted: (
      <>
        <span className="text-[#6c7086]">// 3. Syndicate Consensus & Mathematical Veto</span>
        {'\n'}
        <span className="text-[#cba6f7]">if</span> (<span className="text-[#f38ba8]">risk.vetoEnforced</span> || <span className="text-[#f38ba8]">technical.contradicts(macro)</span>) {'{'}
        {'\n'}  <span className="text-[#cba6f7]">return</span> <span className="text-[#89b4fa]">committee</span>.<span className="text-[#f38ba8]">veto</span>({'{'}
        {'\n'}    <span className="text-[#94e2d5]">status</span>: <span className="text-[#f38ba8]">"DISPUTED_SIGNAL"</span>,
        {'\n'}    <span className="text-[#94e2d5]">reason</span>: <span className="text-[#a6e3a1]">"Conflicting Fed rate cut probability at resistance"</span>
        {'\n'}  {'}'});
        {'\n'}{'}'}
        {'\n'}
        <span className="text-[#cba6f7]">const</span> <span className="text-[#f9e2af]">consensus</span> = <span className="text-[#cba6f7]">await</span> <span className="text-[#89b4fa]">arbiter</span>.<span className="text-[#a6e3a1]">synthesize</span>(hypotheses);
      </>
    ),
  },
  {
    id: 4,
    label: '04',
    tag: 'EXECUTION PLAN',
    title: 'Institutional Grade Trade Orders',
    description:
      'Generates structured institutional trade cards with explicit Entry zones, hard Invalidation levels, and multi-tier Take Profit cones (1:1.5, 1:2.5, 1:4 R:R).',
    fileName: 'execution_cones.ts',
    latency: '18ms',
    codeHighlighted: (
      <>
        <span className="text-[#6c7086]">// 4. Final Asymmetric Execution Card</span>
        {'\n'}
        <span className="text-[#cba6f7]">return</span> <span className="text-[#89b4fa]">createTradeCard</span>({'{'}
        {'\n'}  <span className="text-[#94e2d5]">action</span>: <span className="text-[#a6e3a1]">"BUY_LIMIT"</span>,
        {'\n'}  <span className="text-[#94e2d5]">entryZone</span>: <span className="text-[#fab387]">2864.20</span>,
        {'\n'}  <span className="text-[#94e2d5]">invalidationFloor</span>: <span className="text-[#fab387]">2846.50</span>, <span className="text-[#6c7086]">// Hard stop (1.0% max loss)</span>
        {'\n'}  <span className="text-[#94e2d5]">takeProfitCones</span>: [
        {'\n'}    {'{'} <span className="text-[#94e2d5]">tp1</span>: <span className="text-[#fab387]">2884.00</span>, <span className="text-[#94e2d5]">rr</span>: <span className="text-[#a6e3a1]">"1:1.1"</span>, <span className="text-[#94e2d5]">scaleOut</span>: <span className="text-[#a6e3a1]">"40%"</span> {'}'},
        {'\n'}    {'{'} <span className="text-[#94e2d5]">tp2</span>: <span className="text-[#fab387]">2916.50</span>, <span className="text-[#94e2d5]">rr</span>: <span className="text-[#a6e3a1]">"1:3.0"</span>, <span className="text-[#94e2d5]">scaleOut</span>: <span className="text-[#a6e3a1]">"40%"</span> {'}'},
        {'\n'}    {'{'} <span className="text-[#94e2d5]">tp3</span>: <span className="text-[#fab387]">2940.00</span>, <span className="text-[#94e2d5]">rr</span>: <span className="text-[#a6e3a1]">"1:4.3"</span>, <span className="text-[#94e2d5]">scaleOut</span>: <span className="text-[#a6e3a1]">"20%"</span> {'}'}
        {'\n'}  ]
        {'\n'}{'}'});
      </>
    ),
  },
];

export function LandingStepper() {
  const [activeStep, setActiveStep] = useState<number>(1);
  const current: Step = STEPS.find((s) => s.id === activeStep) ?? STEPS[0]!;

  return (
    <section id="stepper" className="relative py-24 bg-[#0c0d0e] border-t border-b border-white/5">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col items-start gap-4 mb-16 max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-mono">
            <span className="size-2 rounded-full bg-brand" />
            <span className="text-brand font-semibold uppercase tracking-wider">
              Algorithmic Pipeline
            </span>
          </div>

          <h2 className="font-display text-3xl font-normal tracking-[-0.03em] text-fg sm:text-5xl">
            HOW KESTREL EXECUTES{' '}
            <span className="font-redaction-35 italic text-brand">With Precision</span>
          </h2>
          <p className="font-sans text-base text-fg-muted leading-relaxed">
            From raw interbank tick arrival to finalized multi-target trade plans, every decision follows an audited 4-stage algorithmic committee protocol.
          </p>
        </div>

        {/* Stepper Interactive Layout with Vertical Circuit Spine */}
        <div className="grid gap-8 lg:grid-cols-12 lg:items-start">
          {/* Left: 4 Step Selector Buttons along Vertical Circuit */}
          <div className="relative flex flex-col gap-3.5 lg:col-span-5 pl-2 sm:pl-4">
            {/* Vertical Circuit Background Line */}
            <div className="absolute left-[30px] sm:left-[38px] top-7 bottom-7 w-[2px] bg-white/10 z-0" />

            {/* Vertical Glowing Active Laser Tracer */}
            <motion.div
              className="absolute left-[30px] sm:left-[38px] top-7 w-[2px] bg-brand shadow-[0_0_10px_#ff3616] z-0"
              animate={{
                height: `${((activeStep - 1) / (STEPS.length - 1)) * 82}%`,
              }}
              transition={{ type: 'spring', stiffness: 350, damping: 28 }}
            />

            {STEPS.map((step) => {
              const active = step.id === activeStep;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setActiveStep(step.id)}
                  className={cn(
                    'group relative z-10 flex text-left items-start gap-4 rounded-xl p-4 sm:p-5 transition-all duration-200 border',
                    active
                      ? 'surface-chip bg-[#171819] border-white/20 shadow-[var(--shadow-chip)]'
                      : 'border-white/5 bg-[#101112]/90 hover:bg-white/[0.04] hover:border-white/10 backdrop-blur-sm',
                  )}
                >
                  {/* Fluid Gliding Border Highlight */}
                  {active && (
                    <motion.div
                      layoutId="stepper-tab-active-pill"
                      className="absolute inset-0 rounded-xl border border-brand/40 bg-brand/[0.03] -z-10"
                      transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                    />
                  )}

                  {/* Step Number Badge positioned on Circuit Node */}
                  <div
                    className={cn(
                      'relative z-10 flex size-10 shrink-0 items-center justify-center rounded-lg font-mono text-sm font-bold transition-all',
                      active
                        ? 'bg-brand text-white shadow-[0_0_16px_rgba(255,54,22,0.6)] border border-brand'
                        : 'bg-[#0d0e0f] border border-white/10 text-fg-subtle group-hover:text-fg group-hover:border-white/20',
                    )}
                  >
                    {step.label}
                  </div>

                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-semibold tracking-wider text-brand uppercase">
                        {step.tag}
                      </span>
                      <span className="font-mono text-[10px] text-fg-subtle">· {step.latency}</span>
                    </div>
                    <h3 className="font-display text-lg font-normal tracking-tight text-fg group-hover:text-white">
                      {step.title}
                    </h3>
                    <p className="font-sans text-xs leading-relaxed text-fg-muted">
                      {step.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right: Live Interactive Circuit & Code Display with Vertical AnimatePresence */}
          <div className="lg:col-span-7">
            <div className="surface-panel relative overflow-hidden rounded-2xl border border-white/15 bg-[#121314] p-6 shadow-2xl">
              {/* Circuit Header Bar with IDE Dots */}
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full bg-red-500/80" />
                  <span className="size-2.5 rounded-full bg-amber-500/80" />
                  <span className="size-2.5 rounded-full bg-emerald-500/80" />
                  <span className="ml-2 font-mono text-xs text-fg-subtle">
                    pipeline / {current.fileName}
                  </span>
                </div>
                <div className="flex items-center gap-2 font-mono text-xs">
                  <span className="size-2 rounded-full bg-bull animate-pulse" />
                  <span className="text-bull font-semibold">STAGE {current.label} COMPLETE</span>
                </div>
              </div>

              {/* Code Surface with Smooth Vertical Slide */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={current.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -16 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  className="mt-4 overflow-x-auto rounded-xl surface-well p-5 border border-white/5 bg-[#08090a]"
                >
                  <pre className="font-mono text-xs sm:text-[13px] leading-relaxed whitespace-pre font-medium text-fg">
                    <code>{current.codeHighlighted}</code>
                  </pre>
                </motion.div>
              </AnimatePresence>

              {/* Dynamic Circuit Trace Footer */}
              <div className="mt-5 flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] p-3.5 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="text-fg-subtle">PIPELINE LATENCY:</span>
                  <span className="text-bull font-semibold tabular-nums">{current.latency} (158ms total)</span>
                </div>
                <span className="text-fg-subtle">TypeScript 5.7 · Node 22 Strict</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
