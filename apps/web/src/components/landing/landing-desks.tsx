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
import Image from 'next/image';
import { motion, AnimatePresence } from 'motion/react';
import { IconCheck } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import {
  ChartWizardSprite,
  MacroMageSprite,
  RiskKnightSprite,
  KestrelFalconSprite,
} from '@/components/chat/parts/pixel-desk/pixel-sprites';

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
    sprite: <ChartWizardSprite isThinking bias="bullish" />,
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
    sprite: <MacroMageSprite isDone bias="bullish" />,
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
    sprite: <RiskKnightSprite isDone bias="bullish" />,
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
    sprite: <KestrelFalconSprite isDone bias="bullish" />,
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

export function LandingDesks() {
  const [selectedId, setSelectedId] = useState<string>('technical');
  const activeDesk = DESKS.find((d) => d.id === selectedId) ?? DESKS[0]!;

  return (
    <section id="desks" className="relative py-24 bg-[#101112] border-t border-white/5 overflow-hidden">
      {/* ── Neoclassical Cybernetic Hoplite Bust Artwork ── */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 w-full lg:w-[50%] h-[85%] z-0 select-none opacity-20 lg:opacity-25 mix-blend-screen"
        style={{
          maskImage: 'radial-gradient(ellipse 65% 65% at 35% 50%, black 25%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse 65% 65% at 35% 50%, black 25%, transparent 75%)',
        }}
      >
        <Image
          src="/landing/hoplite-spartan-bust.webp"
          alt="Cybernetic Spartan Hoplite Sculpture"
          fill
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="object-cover object-center"
        />
      </div>

      {/* Background Radial Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 right-0 size-[600px] rounded-full bg-brand/5 blur-[120px] select-none"
      />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col items-start gap-4 mb-16 max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-mono">
            <span className="size-2 rounded-full bg-brand animate-pulse" />
            <span className="text-brand font-semibold uppercase tracking-wider">
              Autonomous Syndicate
            </span>
          </div>

          <h2 className="font-display text-3xl font-normal tracking-[-0.03em] text-fg sm:text-5xl">
            THE 4 SPECIALIST DESKS{' '}
            <span className="font-redaction-35 italic text-brand">Deliberating In Sync</span>
          </h2>
          <p className="font-sans text-base text-fg-muted leading-relaxed">
            Unlike single-prompt trading bots that make emotional decisions, Kestrel operates as an institutional multi-desk trading committee. Each specialist evaluates markets from an independent mathematical lens.
          </p>
        </div>

        {/* 4 Desk Selector Tabs with Gliding Fluid Pill */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          {DESKS.map((desk) => {
            const isSelected = desk.id === selectedId;
            return (
              <button
                key={desk.id}
                type="button"
                onClick={() => setSelectedId(desk.id)}
                className={cn(
                  'group relative flex flex-col items-start gap-3 rounded-xl p-4 sm:p-5 text-left transition-all duration-200 border',
                  isSelected
                    ? 'surface-chip bg-[#18191a] border-white/20 shadow-[var(--shadow-chip)]'
                    : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10',
                )}
              >
                {/* Active Indicator Top Line with Spring Gliding */}
                {isSelected && (
                  <motion.div
                    layoutId="active-desk-tab-indicator"
                    className="absolute inset-x-4 top-0 h-[2px] bg-brand rounded-full shadow-[0_0_8px_#ff3616]"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}

                <div className="flex items-center justify-between w-full">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-black/40 border border-white/10">
                    {desk.sprite}
                  </div>
                  <span
                    className={cn(
                      'font-mono text-[10px] font-bold px-2 py-0.5 rounded-full border',
                      isSelected
                        ? 'bg-brand/10 border-brand/30 text-brand'
                        : 'bg-white/5 border-white/5 text-fg-subtle',
                    )}
                  >
                    {desk.verdict.conviction}%
                  </span>
                </div>

                <div>
                  <h3 className="font-display text-base font-normal tracking-tight text-fg group-hover:text-white">
                    {desk.name}
                  </h3>
                  <p className="font-sans text-xs text-fg-muted truncate">
                    {desk.role}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Desk Deep Dive Detail Card with AnimatePresence */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeDesk.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="surface-panel relative overflow-hidden rounded-2xl border border-white/10 bg-[#141516]/95 backdrop-blur-md p-6 sm:p-8 shadow-2xl"
          >
            <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
              {/* Left Col: Spec & Methodology */}
              <div className="lg:col-span-7 flex flex-col gap-6">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-fg-subtle uppercase tracking-wider">
                    {activeDesk.badge}
                  </span>
                  <span className="font-mono text-xs font-medium text-fg-muted">
                    Methodology: <strong className="text-fg">{activeDesk.methodology}</strong>
                  </span>
                </div>

                <div>
                  <h3 className="font-display text-2xl sm:text-3xl font-normal tracking-tight text-fg">
                    {activeDesk.name} · {activeDesk.role}
                  </h3>
                </div>

                {/* Core Features list */}
                <div className="flex flex-col gap-3">
                  {activeDesk.features.map((feat, idx) => (
                    <div key={idx} className="flex items-start gap-3">
                      <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand/10 border border-brand/20 text-brand mt-0.5">
                        <IconCheck className="size-3" />
                      </div>
                      <span className="font-sans text-sm text-fg-muted leading-relaxed">
                        {feat}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Col: Live Desk Verdict Rig */}
              <div className="lg:col-span-5">
                <div className="rounded-xl border border-white/10 bg-[#0d0e0f] p-5 sm:p-6 shadow-inner">
                  {/* Header */}
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-bull animate-pulse" />
                      <span className="font-mono text-xs font-bold tracking-wider text-fg uppercase">
                        ACTIVE HYPOTHESIS
                      </span>
                    </div>
                    <span className={cn('font-mono text-xs font-bold px-2 py-0.5 rounded border', activeDesk.borderColor, activeDesk.color)}>
                      {activeDesk.verdict.bias} · {activeDesk.verdict.conviction}%
                    </span>
                  </div>

                  {/* Key Metric Gauge */}
                  <div className="my-4 rounded-lg surface-well p-3.5 bg-black/50 border border-white/5">
                    <div className="font-mono text-[10px] uppercase text-fg-subtle">
                      PRIMARY DECISION METRIC
                    </div>
                    <div className="mt-1 font-mono text-base sm:text-lg font-bold text-fg">
                      {activeDesk.verdict.keyMetric}
                    </div>
                  </div>

                  {/* Committee Rationale */}
                  <div className="rounded-lg surface-well p-3.5 bg-black/50 border border-white/5 font-sans text-xs leading-relaxed text-fg-muted">
                    <span className="font-mono text-[10px] uppercase text-fg-subtle block mb-1">
                      DELIBERATION RATIONALE
                    </span>
                    &ldquo;{activeDesk.verdict.rationale}&rdquo;
                  </div>

                  {/* Confidence Bar */}
                  <div className="mt-4 pt-3 border-t border-white/10">
                    <div className="flex items-center justify-between text-[11px] font-mono mb-1.5">
                      <span className="text-fg-subtle">COMMITTEE CONVICTION</span>
                      <span className="font-bold text-fg tabular-nums">
                        {activeDesk.verdict.conviction} / 100
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-white/5 overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-brand to-bull rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${activeDesk.verdict.conviction}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
