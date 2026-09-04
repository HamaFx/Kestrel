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

import { useState, useEffect, useRef, useCallback } from 'react';
import { m, AnimatePresence } from 'motion/react';
import {
  IconPlayerPlay,
  IconPlayerPause,
  IconCircleCheck,
  IconFlame,
  IconActivity,
} from '@tabler/icons-react';
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
  telemetry: { label: string; value: string }[];
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
    telemetry: [
      { label: 'THROUGHPUT', value: '14,200 ticks/sec' },
      { label: 'INGESTION WINDOW', value: '15m / 1h / 4h buffers' },
      { label: 'VENUES CONNECTED', value: 'London Fix · NY Killzone' },
    ],
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
    telemetry: [
      { label: 'CONCURRENT DESKS', value: '4 Isolated Sandboxes' },
      { label: 'DELIBERATION TIME', value: '82ms p95 convergence' },
      { label: 'SMC PATTERNS', value: 'FVG + Order Block Sweep' },
    ],
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
    telemetry: [
      { label: 'CONSENSUS ALGORITHM', value: 'Weighted Confidence Matrix' },
      { label: 'VETO THRESHOLD', value: 'Drawdown > 1.0% Hard Abort' },
      { label: 'SIGNAL PURITY', value: 'Zero Contradiction Rule' },
    ],
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
    telemetry: [
      { label: 'ASPR RATIO', value: '1:3.22 Minimum Risk/Reward' },
      { label: 'ORDER CONES', value: 'TP1 (40%) · TP2 (40%) · TP3 (20%)' },
      { label: 'BRIDGE TARGET', value: 'Encrypted FIX 4.4 / MT5 Webhook' },
    ],
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

const STAGE_INTERVAL_MS = 4800;

export function LandingStepper() {
  const [activeStep, setActiveStep] = useState<number>(1);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [progress, setProgress] = useState<number>(0);
  const progressTimerRef = useRef<NodeJS.Timeout | null>(null);

  const nextStep = useCallback(() => {
    setActiveStep((prev) => (prev % STEPS.length) + 1);
    setProgress(0);
  }, []);

  // Auto-advancing stage runner
  useEffect(() => {
    if (!isPlaying) {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      return;
    }

    const intervalMs = 50;
    const increment = (intervalMs / STAGE_INTERVAL_MS) * 100;

    progressTimerRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          nextStep();
          return 0;
        }
        return prev + increment;
      });
    }, intervalMs);

    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    };
  }, [isPlaying, nextStep]);

  const handleSelectStep = (id: number) => {
    setActiveStep(id);
    setProgress(0);
  };

  const current: Step = STEPS.find((s) => s.id === activeStep) ?? STEPS[0]!;

  // Coordinates for the 4 step nodes along the continuous circuit spine
  // Nodes at y = 55, 175, 295, 415
  const nodeYCoordinates = [55, 175, 295, 415];
  const activeY = nodeYCoordinates[activeStep - 1] ?? 55;
  const progressRatio = (activeStep - 1) / (STEPS.length - 1);

  return (
    <section id="stepper" className="relative py-28 lg:py-36 bg-[#0c0d0e] border-t border-b border-white/5 overflow-hidden">
      {/* Background Ambient Plasma Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 left-1/4 size-[600px] rounded-full bg-brand/5 blur-[160px] select-none"
      />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header with Hoplite Rosette Badge */}
        <div className="flex flex-col items-start gap-4 mb-16 max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-mono">
            <span className="size-2 rounded-full bg-brand animate-pulse shadow-[0_0_8px_#ff3616]" />
            <span className="text-brand font-semibold uppercase tracking-wider">
              ※ Continuous Execution Pipeline
            </span>
          </div>

          <h2 className="font-display text-3xl font-normal tracking-[-0.03em] text-fg sm:text-5xl">
            HOW KESTREL EXECUTES{' '}
            <span className="font-redaction-35 italic text-brand">With Precision</span>
          </h2>
          <p className="font-sans text-base text-fg-muted leading-relaxed">
            From raw interbank tick arrival to finalized multi-target trade plans, every order follows an audited 4-stage algorithmic committee protocol connected by a continuous verification spine.
          </p>

          {/* Autoplay & Telemetry Status Pill */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsPlaying(!isPlaying)}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-[#161718] px-3 py-1.5 font-mono text-xs text-fg-subtle transition-colors hover:text-fg hover:border-white/20 active:translate-y-[0.5px]"
            >
              {isPlaying ? (
                <>
                  <IconPlayerPause className="size-3.5 text-brand" />
                  <span>Auto-Advancing Pipeline (Active)</span>
                </>
              ) : (
                <>
                  <IconPlayerPlay className="size-3.5 text-bull" />
                  <span>Resume Auto-Run</span>
                </>
              )}
            </button>
            <span className="font-mono text-xs text-fg-subtle">
              TOTAL PIPELINE LATENCY: <strong className="text-bull">158ms</strong>
            </span>
          </div>
        </div>

        {/* Pipeline Layout: Left Circuit Trace + Stages; Right Dynamic Panel */}
        <div className="grid gap-8 lg:grid-cols-12 lg:items-start">
          {/* Left Column: Continuous Circuit SVG + Step Cards */}
          <div
            role="tablist"
            aria-label="Pipeline stages"
            className="relative flex flex-col gap-4 lg:col-span-6 pl-10 sm:pl-14"
          >
            {/* ── CONTINUOUS MATHEMATICAL SVG CIRCUIT SPINE ── */}
            <div className="absolute left-2 sm:left-4 top-2 bottom-2 w-8 pointer-events-none select-none -z-0">
              <svg
                viewBox="0 0 32 480"
                preserveAspectRatio="none"
                className="size-full overflow-visible"
              >
                <defs>
                  <linearGradient id="circuit-wire-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ff3616" />
                    <stop offset="50%" stopColor="#ff632a" />
                    <stop offset="100%" stopColor="#e5a93c" />
                  </linearGradient>
                  <filter id="glow-bead" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                {/* Layer 1: Background Inactive Circuit Trace */}
                <path
                  d="M 16 20 L 16 460"
                  fill="none"
                  stroke="rgba(255, 255, 255, 0.08)"
                  strokeWidth="2"
                  strokeLinecap="round"
                />

                {/* Layer 2: Illuminated Active Fill Trace */}
                <m.path
                  d="M 16 20 L 16 460"
                  fill="none"
                  stroke="url(#circuit-wire-gradient)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  animate={{
                    pathLength: Math.max(0.01, progressRatio),
                  }}
                  transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                />

                {/* Layer 3: High-Intensity Glowing Runner Bead */}
                <m.circle
                  cx="16"
                  r="4"
                  fill="#ffffff"
                  stroke="#ff3616"
                  strokeWidth="3"
                  filter="url(#glow-bead)"
                  animate={{
                    cy: activeY,
                  }}
                  transition={{ type: 'spring', stiffness: 320, damping: 26 }}
                />

                {/* Concentric Step Node Rings */}
                {nodeYCoordinates.map((ny, idx) => {
                  const isNodeActive = idx + 1 === activeStep;
                  const isNodePassed = idx + 1 < activeStep;
                  return (
                    <g key={idx}>
                      <circle
                        cx="16"
                        cy={ny}
                        r="6"
                        fill="#0c0d0e"
                        stroke={
                          isNodeActive
                            ? '#ff3616'
                            : isNodePassed
                              ? '#3f9e3d'
                              : 'rgba(255,255,255,0.15)'
                        }
                        strokeWidth="1.5"
                      />
                      {isNodeActive && (
                        <circle
                          cx="16"
                          cy={ny}
                          r="10"
                          fill="none"
                          stroke="#ff3616"
                          strokeWidth="1"
                          opacity="0.4"
                          className="animate-ping"
                        />
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* 4 Interactive Stage Cards */}
            {STEPS.map((step) => {
              const active = step.id === activeStep;
              const passed = step.id < activeStep;
              return (
                <button
                  key={step.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls="pipeline-detail-panel"
                  onClick={() => handleSelectStep(step.id)}
                  className={cn(
                    'group relative z-10 flex text-left items-start gap-4 rounded-xl p-4 sm:p-5 transition-all duration-200 border cursor-pointer active:translate-y-[0.5px]',
                    active
                      ? 'surface-chip bg-[#171819] border-brand/50 shadow-[var(--shadow-chip)]'
                      : 'border-white/5 bg-[#101112]/90 hover:bg-white/[0.04] hover:border-white/10 backdrop-blur-sm',
                  )}
                >
                  {/* Fluid Gliding Background Pill */}
                  {active && (
                    <m.div
                      layoutId="stepper-tab-active-pill"
                      className="absolute inset-0 rounded-xl border border-brand/40 bg-brand/[0.04] -z-10"
                      transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                    />
                  )}

                  {/* Step Number Badge in Redaction Font */}
                  <div
                    className={cn(
                      'relative z-10 flex size-10 shrink-0 items-center justify-center rounded-lg font-mono text-sm font-bold transition-all',
                      active
                        ? 'bg-brand text-white shadow-[0_0_18px_rgba(255,54,22,0.8)] border border-brand'
                        : passed
                          ? 'bg-[#121b14] border border-bull/30 text-bull'
                          : 'bg-[#0d0e0f] border border-white/10 text-fg-subtle group-hover:text-fg group-hover:border-white/20',
                    )}
                  >
                    {passed ? <IconCircleCheck className="size-5" /> : step.label}
                  </div>

                  <div className="flex flex-col gap-1 w-full min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] font-semibold tracking-wider text-brand uppercase">
                          {step.tag}
                        </span>
                        <span className="font-mono text-[10px] text-fg-subtle">· {step.latency}</span>
                      </div>
                      {active && isPlaying && (
                        <span className="font-mono text-[10px] text-brand uppercase font-bold animate-pulse">
                          RUNNING
                        </span>
                      )}
                    </div>

                    <h3 className="font-display text-lg font-normal tracking-tight text-fg group-hover:text-white">
                      {step.title}
                    </h3>
                    <p className="font-sans text-xs leading-relaxed text-fg-muted">
                      {step.description}
                    </p>

                    {/* Active Step Progress Countdown Strip */}
                    {active && isPlaying && (
                      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full bg-brand transition-all duration-75 ease-linear"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right Column: Code & Operational Telemetry Workbench with Hoplite Lit State Glow Mask */}
          <div id="pipeline-detail-panel" role="tabpanel" className="lg:col-span-6">
            <div className="relative overflow-hidden rounded-2xl border border-brand/40 bg-[#121314] p-6 shadow-2xl">
              {/* Hoplite Signature Elliptical Radial Border Glow Mask */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-2xl select-none"
                style={{
                  border: '0.5px solid #ff3616',
                  maskImage: 'radial-gradient(ellipse 60% 48% at 100% 0%, black 30%, transparent 72%)',
                  WebkitMaskImage: 'radial-gradient(ellipse 60% 48% at 100% 0%, black 30%, transparent 72%)',
                  backgroundImage: 'radial-gradient(ellipse 52% 44% at 100% 0%, rgba(255,54,22,0.12) 0%, transparent 70%)',
                }}
              />

              {/* Workbench Header Bar with IDE Status Controls */}
              <div className="flex items-center justify-between border-b border-white/10 pb-4 relative z-10">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full bg-red-500/80" />
                  <span className="size-2.5 rounded-full bg-amber-500/80" />
                  <span className="size-2.5 rounded-full bg-emerald-500/80" />
                  <span className="ml-2 font-mono text-xs text-fg-subtle">
                    kestrel / pipeline / {current.fileName}
                  </span>
                </div>
                <div className="flex items-center gap-2 font-mono text-xs">
                  <span className="size-2 rounded-full bg-bull animate-pulse" />
                  <span className="text-bull font-semibold">STAGE {current.label} VERIFIED</span>
                </div>
              </div>

              {/* Code Surface with Smooth Fade */}
              <AnimatePresence mode="wait">
                <m.div
                  key={current.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="mt-4 overflow-x-auto rounded-xl surface-well p-5 border border-white/5 bg-[#08090a] relative z-10"
                >
                  <pre className="font-mono text-xs sm:text-[13px] leading-relaxed whitespace-pre font-medium text-fg">
                    <code>{current.codeHighlighted}</code>
                  </pre>
                </m.div>
              </AnimatePresence>

              {/* Live Stage Telemetry Metrics Grid */}
              <div className="mt-4 grid grid-cols-3 gap-2.5 relative z-10 font-mono text-xs">
                {current.telemetry.map((item, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg surface-well p-2.5 bg-black/40 border border-white/5 flex flex-col gap-0.5"
                  >
                    <span className="text-[9px] text-fg-subtle uppercase">{item.label}</span>
                    <span className="font-bold text-fg text-[11px] truncate">{item.value}</span>
                  </div>
                ))}
              </div>

              {/* Dynamic Pipeline Circuit Footer */}
              <div className="mt-4 flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] p-3.5 text-xs font-mono relative z-10">
                <div className="flex items-center gap-2">
                  <IconActivity className="size-4 text-brand" />
                  <span className="text-fg-subtle">EXECUTION CYCLE:</span>
                  <span className="text-bull font-semibold tabular-nums">{current.latency}</span>
                </div>
                <div className="flex items-center gap-1.5 text-brand">
                  <IconFlame className="size-3.5" />
                  <span>Deterministic Kernel</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
