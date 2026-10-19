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
import {
  IconBuildingBank,
  IconChartCandle,
  IconCheck,
  IconRadar,
  IconScale,
} from '@tabler/icons-react';
import { AnimatePresence, m } from 'motion/react';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/cn';

interface DeskSpec {
  id: string;
  name: string;
  role: string;
  badge: string;
  color: string;
  borderColor: string;
  bgGlow: string;
  sprite: React.ReactNode;
  methodology: string;
  verdict: {
    bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    conviction: number;
    keyMetric: string;
    rationale: string;
  };
  features: string[];
}

const DESKS: DeskSpec[] = [
  {
    id: 'technical',
    name: 'Technical Desk',
    role: 'SMC & Liquidity Architect',
    badge: 'PRICE ACTION & ORDER FLOW',
    color: 'text-bull',
    borderColor: 'border-bull/30',
    bgGlow: 'from-bull/10 to-transparent',
    sprite: <IconChartCandle className="text-bull size-5" />,
    methodology: 'Multi-Timeframe Smart Money Concepts (SMC)',
    verdict: {
      bias: 'BULLISH',
      conviction: 94,
      keyMetric: '15m FVG Re-test @ 2,860.20',
      rationale:
        'Clean liquidity sweep of Asian session lows followed by explosive displacement through the 4h bearish order block.',
    },
    features: [
      'Fair Value Gap (FVG) and Liquidity Void scanning across 15m, 1h, 4h, and Daily frames',
      'Institutional order block identification with automated premium/discount equilibrium pricing',
      'Session-open liquidity sweeps: London Silver Bullet, NY AM/PM Killzones, and Asia range fades',
      'Real-time volume delta and footprint divergence detection',
    ],
  },
  {
    id: 'macro',
    name: 'Macroeconomic Desk',
    role: 'Central Bank & Yield Strategist',
    badge: 'INTEREST RATES & CATALYSTS',
    color: 'text-info',
    borderColor: 'border-info/30',
    bgGlow: 'from-info/10 to-transparent',
    sprite: <IconBuildingBank className="text-info size-5" />,
    methodology: 'Central Bank Reaction Functions & Yield Dynamics',
    verdict: {
      bias: 'BULLISH',
      conviction: 88,
      keyMetric: 'US 10Y Yields -4.2 bps (4.28%)',
      rationale:
        'Softening PCE inflation metrics increase probability of 25 bps rate cut, compressing real yields and boosting non-yielding bullion demand.',
    },
    features: [
      'Sub-second news parsing across Bloomberg, Reuters, Dow Jones, and institutional wires',
      'Real-time US Treasury 2Y/10Y yield curve inversion and real interest rate tracking',
      'FedWatch / ECB / BOE rate cut probability matrices dynamically recalculated per speech',
      'High-impact economic catalyst event countdown with automated volatility forecasting',
    ],
  },
  {
    id: 'risk',
    name: 'Quantitative Risk Desk',
    role: '1% Mathematical Governor',
    badge: 'CAPITAL PRESERVATION & VETO',
    color: 'text-warn',
    borderColor: 'border-warn/30',
    bgGlow: 'from-warn/10 to-transparent',
    sprite: <IconScale className="text-warn size-5" />,
    methodology: 'Kelly-Adjusted Volatility Invalidation Protocol',
    verdict: {
      bias: 'BULLISH',
      conviction: 92,
      keyMetric: '1:3.22 Risk/Reward Ratio',
      rationale:
        'Strict 1.0% account drawdown constraint satisfied with ATR invalidation stop placed below the structural swing low at 2,846.50.',
    },
    features: [
      'Immutable 1.0% portfolio drawdown ceiling — automatically vetoes sub-par setups',
      'Volatility-adjusted ATR (Average True Range) stop loss placing beyond market noise',
      'Dynamic multi-tier Take-Profit cones (1:1.5 partial, 1:2.5 runner, 1:4.0 maximum extension)',
      'Asymmetric trade structure verification preventing negative expected value entries',
    ],
  },
  {
    id: 'sentiment',
    name: 'Institutional Desk',
    role: 'Whale Positioning & COT Analyst',
    badge: 'CFTC & VOLUME PROFILE',
    color: 'text-brand',
    borderColor: 'border-brand/30',
    bgGlow: 'from-brand/10 to-transparent',
    sprite: <IconRadar className="text-brand size-5" />,
    methodology: 'CFTC Commitments of Traders & Interbank Flow',
    verdict: {
      bias: 'BULLISH',
      conviction: 86,
      keyMetric: 'COT Commercial Net Long +18,420 contracts',
      rationale:
        'Major bullion banks expanding net long positioning for third consecutive week while retail traders remain 64% short at resistance.',
    },
    features: [
      'Weekly CFTC Commitments of Traders (COT) report breakdown: Commercial Hedgers vs. Non-Commercial Funds',
      'Retail sentiment contrarian index — fading crowded retail positioning traps',
      'Central bank sovereign gold reserve accumulation trends and ETF bullion inventory flows',
      'Interbank currency correlation tracking (EUR/USD, GBP/USD, USD/JPY vs. DXY basket)',
    ],
  },
];

const CYCLE_DURATION_MS = 6000;

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

  return (
    <section
      id="desks"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className="relative overflow-hidden border-t border-white/5 bg-[#101112] py-28 lg:py-36"
    >
      {/* ── Neoclassical Cybernetic Hoplite Bust Artwork ── */}
      <div
        aria-hidden="true"
        className="desks-backdrop-mask pointer-events-none absolute top-4 left-0 z-0 h-[360px] w-full opacity-20 mix-blend-screen select-none sm:top-8 sm:h-[480px] lg:top-1/2 lg:h-[85%] lg:w-[48%] lg:-translate-y-1/2 lg:opacity-25"
      >
        <Image
          src="/landing/hoplite-spartan-bust.webp"
          alt="Cybernetic Spartan Hoplite Sculpture"
          fill
          unoptimized
          sizes="(max-width: 1024px) 100vw, 50vw"
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
        <div className="mb-16 flex max-w-3xl flex-col items-start gap-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-xs">
            <span className="bg-brand size-2 animate-pulse rounded-full" />
            <span className="text-brand font-semibold tracking-wider uppercase">
              Autonomous Syndicate
            </span>
          </div>

          <h2 className="font-display text-fg text-3xl font-normal tracking-[-0.03em] sm:text-5xl">
            THE 4 SPECIALIST DESKS{' '}
            <span className="font-redaction-35 text-brand italic">Deliberating In Sync</span>
          </h2>
          <p className="text-fg-muted font-sans text-base leading-relaxed">
            Unlike single-prompt trading bots that make emotional decisions, Kestrel operates as an
            institutional multi-desk trading committee. Each specialist evaluates markets from an
            independent mathematical lens.
          </p>
        </div>

        {/* 4 Desk Selector Tabs with Auto-Cycle Progress Indicator */}
        <div
          role="tablist"
          aria-label="Specialist Desks"
          className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4"
        >
          {DESKS.map((desk) => {
            const isSelected = desk.id === selectedId;
            return (
              <button
                key={desk.id}
                id={`desk-tab-${desk.id}`}
                type="button"
                role="tab"
                aria-selected={isSelected}
                aria-controls={`desk-panel-${desk.id}`}
                onClick={() => {
                  setSelectedId(desk.id);
                  setIsPaused(true);
                }}
                className={cn(
                  'group relative flex flex-col items-start gap-3 overflow-hidden rounded-xl border p-4 text-left transition-all duration-200 active:translate-y-[0.5px] sm:p-5',
                  isSelected
                    ? 'surface-chip border-white/20 bg-[#18191a] shadow-[var(--shadow-chip)]'
                    : 'border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]',
                )}
              >
                {/* Active Indicator Top Line with Spring Gliding */}
                {isSelected && (
                  <m.div
                    layoutId="active-desk-tab-indicator"
                    className="bg-brand absolute inset-x-4 top-0 h-[2px] rounded-full shadow-[0_0_8px_#ff3616]"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}

                {/* Tab Countdown Progress Strip */}
                {isSelected && !isPaused && (
                  <div className="absolute inset-x-0 bottom-0 h-[2px] bg-white/5">
                    <div
                      key={desk.id}
                      className="bg-brand/80 landing-cycle-progress h-full origin-left transition-all"
                      style={{ animationDuration: `${CYCLE_DURATION_MS}ms` }}
                    />
                  </div>
                )}

                <div className="flex w-full items-center justify-between">
                  <div className="flex size-10 items-center justify-center rounded-lg border border-white/10 bg-black/40">
                    {desk.sprite}
                  </div>
                  <span
                    className={cn(
                      'rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold',
                      isSelected
                        ? 'bg-brand/10 border-brand/30 text-brand'
                        : 'text-fg-subtle border-white/5 bg-white/5',
                    )}
                  >
                    {desk.verdict.conviction}%
                  </span>
                </div>

                <div>
                  <h3 className="font-display text-fg text-base font-normal tracking-tight group-hover:text-white">
                    {desk.name}
                  </h3>
                  <p className="text-fg-muted truncate font-sans text-xs">{desk.role}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Desk Deep Dive Detail Card with AnimatePresence */}
        <AnimatePresence mode="wait">
          <m.div
            key={activeDesk.id}
            id={`desk-panel-${activeDesk.id}`}
            role="tabpanel"
            aria-labelledby={`desk-tab-${activeDesk.id}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="surface-panel relative overflow-hidden rounded-2xl border border-white/10 bg-[#141516]/95 p-6 shadow-2xl backdrop-blur-md sm:p-8"
          >
            <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
              {/* Left Col: Spec & Methodology */}
              <div className="flex flex-col gap-6 lg:col-span-7">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-fg-subtle rounded-md border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-xs font-semibold tracking-wider uppercase">
                    {activeDesk.badge}
                  </span>
                  <span className="text-fg-muted font-mono text-xs font-medium">
                    Methodology: <strong className="text-fg">{activeDesk.methodology}</strong>
                  </span>
                </div>

                <div>
                  <h3 className="font-display text-fg text-2xl font-normal tracking-tight sm:text-3xl">
                    {activeDesk.name} · {activeDesk.role}
                  </h3>
                </div>

                {/* Core Features list */}
                <div className="flex flex-col gap-3">
                  {activeDesk.features.map((feat, idx) => (
                    <div key={idx} className="flex items-start gap-3">
                      <div className="bg-brand/10 border-brand/20 text-brand mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border">
                        <IconCheck className="size-3" />
                      </div>
                      <span className="text-fg-muted font-sans text-sm leading-relaxed">
                        {feat}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Col: Live Desk Verdict Rig */}
              <div className="lg:col-span-5">
                <div className="rounded-xl border border-white/10 bg-[#0d0e0f] p-5 shadow-inner sm:p-6">
                  {/* Header */}
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="bg-bull size-2 animate-pulse rounded-full" />
                      <span className="text-fg font-mono text-xs font-bold tracking-wider uppercase">
                        ACTIVE HYPOTHESIS
                      </span>
                    </div>
                    <span
                      className={cn(
                        'rounded border px-2 py-0.5 font-mono text-xs font-bold',
                        activeDesk.borderColor,
                        activeDesk.color,
                      )}
                    >
                      {activeDesk.verdict.bias} · {activeDesk.verdict.conviction}%
                    </span>
                  </div>

                  {/* Key Metric Gauge */}
                  <div className="surface-well my-4 rounded-lg border border-white/5 bg-black/50 p-3.5">
                    <div className="text-fg-subtle font-mono text-[10px] uppercase">
                      PRIMARY DECISION METRIC
                    </div>
                    <div className="text-fg mt-1 font-mono text-base font-bold sm:text-lg">
                      {activeDesk.verdict.keyMetric}
                    </div>
                  </div>

                  {/* Committee Rationale */}
                  <div className="surface-well text-fg-muted rounded-lg border border-white/5 bg-black/50 p-3.5 font-sans text-xs leading-relaxed">
                    <span className="text-fg-subtle mb-1 block font-mono text-[10px] uppercase">
                      DELIBERATION RATIONALE
                    </span>
                    &ldquo;{activeDesk.verdict.rationale}&rdquo;
                  </div>

                  {/* Confidence Bar */}
                  <div className="mt-4 border-t border-white/10 pt-3">
                    <div className="mb-1.5 flex items-center justify-between font-mono text-[11px]">
                      <span className="text-fg-subtle">COMMITTEE CONVICTION</span>
                      <span className="text-fg font-bold tabular-nums">
                        {activeDesk.verdict.conviction} / 100
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
                      <m.div
                        className="from-brand to-bull h-full rounded-full bg-gradient-to-r"
                        initial={{ width: 0 }}
                        animate={{ width: `${activeDesk.verdict.conviction}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </m.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
