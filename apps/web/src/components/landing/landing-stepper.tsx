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
    tag: 'MARKET SCAN',
    title: 'Live Price, Key Levels & Macro Context',
    description:
      'Ask about any symbol or pick from your watchlist. Kestrel pulls multi-timeframe price action, Spot Gold (XAU/USD), US Treasury yields, and the Dollar Index (DXY) automatically.',
    fileName: 'step-01-market-scan',
    latency: 'Step 1 of 4',
    telemetry: [
      { label: 'TIMEFRAMES SCANNED', value: '15m / 1H / 4H / Daily' },
      { label: 'CORRELATIONS', value: 'US10Y · US02Y · DXY' },
      { label: 'ACTIVE SESSIONS', value: 'London Fix · NY Killzone' },
    ],
    codeHighlighted: (
      <>
        <span className="text-[#6c7086]">─── MARKET CONTEXT SNAPSHOT · XAU/USD (4H) ───</span>
        {'\n'}
        <span className="text-[#94e2d5]">Spot Price:</span>      <span className="text-[#a6e3a1]">$2,864.20 (+1.42% Session)</span>
        {'\n'}
        <span className="text-[#94e2d5]">Key Support:</span>     <span className="text-[#f9e2af]">$2,846.50 (4H Bullish Demand + EMA 50)</span>
        {'\n'}
        <span className="text-[#94e2d5]">Key Resistance:</span>  <span className="text-[#f9e2af]">$2,884.00 (Prior Weekly High)</span>
        {'\n'}
        <span className="text-[#94e2d5]">Macro Context:</span>   <span className="text-[#89b4fa]">US 10Y Yield 4.28% (-4.2 bps) · DXY Softening</span>
        {'\n'}
        <span className="text-[#94e2d5]">Next Red Event:</span>  <span className="text-[#fab387]">US Core PCE in 18h 40m (Clear Window)</span>
      </>
    ),
  },
  {
    id: 2,
    label: '02',
    tag: '4-DESK DELIBERATION',
    title: '4 Specialist AI Desks Weigh In',
    description:
      'Four specialized AI desks evaluate the setup in parallel: Technicals maps Fair Value Gaps and structure, Macro reviews central bank catalysts, Risk calculates ATR stop distance, and Sentiment checks COT positioning.',
    fileName: 'step-02-committee-debate',
    latency: 'Step 2 of 4',
    telemetry: [
      { label: 'SPECIALIST DESKS', value: '4 Independent Analysts' },
      { label: 'TECHNICAL BIAS', value: 'Bullish FVG + Sweep (94%)' },
      { label: 'COT POSITIONING', value: 'Commercials Net Long' },
    ],
    codeHighlighted: (
      <>
        <span className="text-[#6c7086]">─── INDEPENDENT 4-DESK DELIBERATION SUMMARY ───</span>
        {'\n'}
        <span className="text-[#a6e3a1]">[TECHNICAL DESK]</span>  <span className="text-[#f9e2af]">BULLISH (94%)</span> · Asia low swept into 15m FVG
        {'\n'}
        <span className="text-[#89b4fa]">[MACRO DESK]</span>      <span className="text-[#f9e2af]">BULLISH (88%)</span> · Real yields compressing ahead of Fed
        {'\n'}
        <span className="text-[#fab387]">[RISK DESK]</span>       <span className="text-[#f9e2af]">APPROVED (92%)</span> · 17.70 pt stop fits 1.0% risk cap
        {'\n'}
        <span className="text-[#cba6f7]">[SENTIMENT DESK]</span>  <span className="text-[#f9e2af]">BULLISH (86%)</span> · CFTC Commercials +18.4k contracts
      </>
    ),
  },
  {
    id: 3,
    label: '03',
    tag: 'RISK GUARDRAILS',
    title: 'Conflict Check & 1% Risk Protection',
    description:
      'The Lead Arbiter checks for conflicting signals across desks (such as bullish price action right before a high-impact Fed release) and blocks setups that violate your 1% risk limit.',
    fileName: 'step-03-risk-guardrails',
    latency: 'Step 3 of 4',
    telemetry: [
      { label: 'CONFLICT CHECK', value: '4/4 Desks Aligned' },
      { label: 'RISK CEILING', value: '≤ 1.0% Account Risk' },
      { label: 'EVENT HAZARD', value: 'No Red-Folder Imminent' },
    ],
    codeHighlighted: (
      <>
        <span className="text-[#6c7086]">─── RISK GUARDRAIL & CONFLICT AUDIT ───</span>
        {'\n'}
        <span className="text-[#94e2d5]">Desk Alignment:</span>   <span className="text-[#a6e3a1]">4 of 4 Desks Bullish (Zero Contradictions)</span>
        {'\n'}
        <span className="text-[#94e2d5]">Stop Placement:</span>   <span className="text-[#f9e2af]">$2,846.50 (1.5x ATR below 15m swing low)</span>
        {'\n'}
        <span className="text-[#94e2d5]">Max Account Risk:</span> <span className="text-[#a6e3a1]">0.85% Equity (Within 1.0% Safety Cap)</span>
        {'\n'}
        <span className="text-[#94e2d5]">Verdict Status:</span>   <span className="text-[#a6e3a1]">✓ CLEARED FOR TRADE PLAN GENERATION</span>
      </>
    ),
  },
  {
    id: 4,
    label: '04',
    tag: 'CLEAR ACTION PLAN',
    title: 'Complete Trade Plan & Multi-Target Cones',
    description:
      'Delivers a structured trade card with exact Entry zones, hard Invalidation levels, and multi-tier Take-Profit targets (TP1, TP2, TP3) ready to log to your Trade Journal or arm as alerts.',
    fileName: 'step-04-trade-plan',
    latency: 'Step 4 of 4',
    telemetry: [
      { label: 'RISK / REWARD', value: '1:3.22 Asymmetric Setup' },
      { label: 'TAKE-PROFIT TIERS', value: 'TP1 (40%) · TP2 (40%) · TP3 (20%)' },
      { label: 'ONE-CLICK ACTION', value: 'Trade Journal & Price Alerts' },
    ],
    codeHighlighted: (
      <>
        <span className="text-[#6c7086]">─── FINALIZED COMMITTEE TRADE PLAN · XAU/USD ───</span>
        {'\n'}
        <span className="text-[#94e2d5]">Directional Bias:</span> <span className="text-[#a6e3a1]">BUY / LONG (91% Committee Conviction)</span>
        {'\n'}
        <span className="text-[#94e2d5]">Entry Zone:</span>       <span className="text-[#f9e2af]">$2,862.50 – $2,864.20</span>
        {'\n'}
        <span className="text-[#94e2d5]">Invalidation SL:</span>  <span className="text-[#f38ba8]">$2,846.50 (-1.0R Hard Stop)</span>
        {'\n'}
        <span className="text-[#94e2d5]">Target 1 (1.1R):</span>  <span className="text-[#a6e3a1]">$2,884.00 (Scale out 40% & move SL to BE)</span>
        {'\n'}
        <span className="text-[#94e2d5]">Target 2 (3.0R):</span>  <span className="text-[#a6e3a1]">$2,916.50 (Scale out 40%)</span>
        {'\n'}
        <span className="text-[#94e2d5]">Target 3 (4.3R):</span>  <span className="text-[#a6e3a1]">$2,940.00 (Trail remaining 20% runner)</span>
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
              ※ 4-Step Research Workflow
            </span>
          </div>

          <h2 className="font-display text-3xl font-normal tracking-[-0.03em] text-fg sm:text-5xl">
            HOW KESTREL BUILDS{' '}
            <span className="font-redaction-35 italic text-brand">Your Trade Plan</span>
          </h2>
          <p className="font-sans text-base text-fg-muted leading-relaxed">
            From scanning live price structure to delivering a risk-checked trade plan with exact invalidation and take-profit targets, here is what happens every time you ask Kestrel to analyze a market.
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
              COMMITTEE WORKFLOW: <strong className="text-bull">4 VERIFIED STAGES</strong>
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
                          ACTIVE
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

          {/* Right Column: Live Briefing Preview Workbench with Hoplite Lit State Glow Mask */}
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

              {/* Workbench Header Bar */}
              <div className="flex items-center justify-between border-b border-white/10 pb-4 relative z-10">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full bg-red-500/80" />
                  <span className="size-2.5 rounded-full bg-amber-500/80" />
                  <span className="size-2.5 rounded-full bg-emerald-500/80" />
                  <span className="ml-2 font-mono text-xs text-fg-subtle">
                    kestrel / briefing / {current.fileName}
                  </span>
                </div>
                <div className="flex items-center gap-2 font-mono text-xs">
                  <span className="size-2 rounded-full bg-bull animate-pulse" />
                  <span className="text-bull font-semibold">STAGE {current.label} VERIFIED</span>
                </div>
              </div>

              {/* Briefing Output Surface with Smooth Fade */}
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
                  <span className="text-fg-subtle">WORKFLOW STAGE:</span>
                  <span className="text-bull font-semibold tabular-nums">{current.latency}</span>
                </div>
                <div className="flex items-center gap-1.5 text-brand">
                  <IconFlame className="size-3.5" />
                  <span>Verified Trade Protocol</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
