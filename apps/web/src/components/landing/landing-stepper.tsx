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
import { cn } from '@/lib/cn';

interface Step {
  id: number;
  label: string;
  tag: string;
  title: string;
  description: string;
  codeSnippet: string;
}

const STEPS: Step[] = [
  {
    id: 1,
    label: '01',
    tag: 'TICK INGESTION',
    title: 'Multi-Venue Liquidity Sweep',
    description: 'Sub-second tick ingestion aggregating interbank FX pairs, Spot Gold (XAU), US Treasury yields, and Dollar Index (DXY) into an indexed memory stream.',
    codeSnippet: '// 1. Venue Ingestion Pipeline\nawait kestrel.ingest({\n  symbol: "XAUUSD",\n  depth: "interbank-l2",\n  feeds: ["NY_OPEN", "LONDON_FIX"],\n  macroYields: ["US10Y", "US02Y", "DXY"]\n});',
  },
  {
    id: 2,
    label: '02',
    tag: 'PARALLEL ENGINES',
    title: '4-Desk Concurrent Deliberation',
    description: 'Four specialized algorithmic agents spin up in parallel: Technicals scans Fair Value Gaps, Macro reviews central bank catalysts, Risk computes ATR stop-losses, and Sentiment tracks CFTC COT positioning.',
    codeSnippet: '// 2. Parallel 4-Desk Synthesis\nconst deliberation = await committee.deliberate({\n  technical:   scanOrderBlocks(["15m", "1h", "4h"]),\n  fundamental: parseCatalysts(["FOMC", "CPI", "NFP"]),\n  risk:        calculateMaxDrawdown("1%_AUM"),\n  sentiment:   queryCOTInstitutionalWhales()\n});',
  },
  {
    id: 3,
    label: '03',
    tag: 'MASTRA ARBITRATION',
    title: 'Syndicate Consensus & Invalidation',
    description: 'The Lead Arbiter scores weighted desk confidence, tests for contradictory signals (e.g. bullish price action into hawkish Fed print), and enforces mathematical vetoes.',
    codeSnippet: '// 3. Arbitration & Veto Evaluation\nif (risk.vetoFlagged || technical.contradicts(macro)) {\n  return committee.reject({\n    status: "DISPUTED_SIGNAL",\n    reason: "Conflicting Fed rate regime at resistance"\n  });\n}\nconst score = committee.weighConfidence(deliberation);',
  },
  {
    id: 4,
    label: '04',
    tag: 'EXECUTION PLAN',
    title: 'Institutional Grade Trade Orders',
    description: 'Generates structured institutional trade cards with explicit Entry zones, hard Invalidation levels, and multi-tier Take Profit cones (1:1.5, 1:2.5, 1:4 R:R).',
    codeSnippet: '// 4. Execution Cones Generated\nreturn {\n  direction: "BUY_STOP_LIMIT",\n  entry: 2864.20,\n  invalidation: 2846.50,\n  takeProfitCones: [\n    { target: 2884.00, rr: "1:1.1", scaleOut: "40%" },\n    { target: 2916.50, rr: "1:3.0", scaleOut: "40%" },\n    { target: 2940.00, rr: "1:4.3", scaleOut: "20%" }\n  ]\n};',
  },
];

export function LandingStepper() {
  const [activeStep, setActiveStep] = useState<number>(1);
  const current: Step = STEPS.find((s) => s.id === activeStep) ?? STEPS[0]!;

  return (
    <section id="stepper" className="relative py-24 bg-[#0d0d0d] border-t border-b border-white/5">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col items-start gap-4 mb-16 max-w-3xl">
          <span className="font-mono text-xs font-semibold tracking-wider text-brand uppercase">
            Algorithmic Pipeline
          </span>
          <h2 className="font-display text-3xl font-normal tracking-[-0.03em] text-fg sm:text-5xl">
            HOW KESTREL EXECUTES{' '}
            <span className="font-redaction-35 italic text-brand">With Precision</span>
          </h2>
          <p className="font-sans text-base text-fg-muted leading-relaxed">
            From raw interbank tick arrival to finalized multi-target trade plans, every decision follows an audited 4-stage algorithmic committee protocol.
          </p>
        </div>

        {/* Stepper Interactive Layout */}
        <div className="grid gap-8 lg:grid-cols-12 lg:items-start">
          {/* Left: 4 Step Selector Buttons */}
          <div className="flex flex-col gap-3 lg:col-span-5">
            {STEPS.map((step) => {
              const active = step.id === activeStep;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setActiveStep(step.id)}
                  className={cn(
                    'group relative flex text-left items-start gap-4 rounded-xl p-4 sm:p-5 transition-all duration-200 border',
                    active
                      ? 'surface-chip bg-[#181818] border-brand/50 shadow-[var(--shadow-chip)]'
                      : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10',
                  )}
                >
                  {/* Step Number Badge */}
                  <div
                    className={cn(
                      'flex size-10 shrink-0 items-center justify-center rounded-lg font-mono text-sm font-bold transition-colors',
                      active
                        ? 'bg-brand text-white shadow-[0_0_12px_rgba(255,54,22,0.4)]'
                        : 'bg-white/5 text-fg-subtle group-hover:text-fg',
                    )}
                  >
                    {step.label}
                  </div>

                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-semibold tracking-wider text-brand uppercase">
                        {step.tag}
                      </span>
                    </div>
                    <h3 className="font-display text-lg font-normal tracking-tight text-fg">
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

          {/* Right: Live Interactive Circuit & Code Display */}
          <div className="lg:col-span-7">
            <div className="surface-panel relative overflow-hidden rounded-2xl border border-white/15 bg-[#121212] p-6 shadow-2xl">
              {/* Circuit Header Bar */}
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-2.5">
                  <svg className="size-4" viewBox="0 0 16 16">
                    <circle cx="8" cy="8" r="7" fill="none" stroke="#ff3616" strokeWidth="1.5" />
                    <circle cx="8" cy="8" r="3" fill="#ff3616" className="animate-pulse" />
                  </svg>
                  <span className="font-mono text-xs font-bold tracking-wider text-fg uppercase">
                    STAGE {current.label} · {current.tag}
                  </span>
                </div>
                <div className="flex items-center gap-2 font-mono text-xs text-fg-subtle">
                  <span className="size-2 rounded-full bg-bull" />
                  <span>SYNTHESIS_ACTIVE</span>
                </div>
              </div>

              {/* Code Surface */}
              <div className="mt-4 overflow-x-auto rounded-xl surface-well p-4 border border-white/5 bg-[#080808]">
                <div className="mb-3 flex items-center justify-between text-[11px] font-mono text-fg-subtle border-b border-white/5 pb-2">
                  <span>committee_pipeline.ts</span>
                  <span>TypeScript 5.7</span>
                </div>
                <pre className="font-mono text-xs leading-relaxed text-fg-muted">
                  <code>{current.codeSnippet}</code>
                </pre>
              </div>

              {/* Dynamic Circuit Trace Footer */}
              <div className="mt-5 flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-3 text-xs font-mono">
                <span className="text-fg-subtle">LATENCY BENCHMARK:</span>
                <span className="text-bull font-semibold tabular-nums">184ms end-to-end</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
