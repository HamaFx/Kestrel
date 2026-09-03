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

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  IconChevronLeft,
  IconChevronRight,
  IconTrendingUp,
  IconCheck,
  IconClock,
  IconPlayerPause,
  IconPlayerPlay,
} from '@tabler/icons-react';
import { cn } from '@/lib/cn';

interface CaseStudy {
  id: string;
  symbol: string;
  title: string;
  tag: string;
  date: string;
  gain: string;
  pips: string;
  rr: string;
  direction: 'BUY / LONG' | 'SELL / SHORT';
  entry: string;
  invalidation: string;
  target1: string;
  target2: string;
  target3: string;
  committeeVoting: {
    tech: number;
    macro: number;
    risk: number;
    sentiment: number;
  };
  steps: {
    time: string;
    stage: string;
    detail: string;
  }[];
}

const CASE_STUDIES: CaseStudy[] = [
  {
    id: 'case-gold',
    symbol: 'XAU/USD',
    title: 'London Silver Bullet Liquidity Sweep',
    tag: 'SMC + YIELD DIVERGENCE',
    date: 'Wednesday 07:00 UTC',
    gain: '+$4,820',
    pips: '+184 Pips',
    rr: '1:3.22',
    direction: 'BUY / LONG',
    entry: '2,864.20',
    invalidation: '2,846.50',
    target1: '2,884.00 (+40% scaled)',
    target2: '2,916.50 (+40% scaled)',
    target3: '2,940.00 (+20% runner)',
    committeeVoting: {
      tech: 94,
      macro: 88,
      risk: 92,
      sentiment: 86,
    },
    steps: [
      {
        time: '07:00:14 UTC',
        stage: 'Tick Ingestion',
        detail: 'Asia range low (2,860.20) swept into 15m Fair Value Gap on interbank L2.',
      },
      {
        time: '07:00:18 UTC',
        stage: '4-Desk Deliberation',
        detail: 'Technicals confirms displacement (+94%). Macro flags US10Y drop of -4.2 bps (+88%).',
      },
      {
        time: '07:00:22 UTC',
        stage: 'Lead Arbiter Veto Check',
        detail: 'Risk governor certifies strict 1.0% portfolio ceiling. Stop set @ 2,846.50 (1:3.22 R:R).',
      },
      {
        time: '07:00:26 UTC',
        stage: 'Order Ticket Stamped',
        detail: 'Signed TX hash #0x8F4A21 issued with 3-tier partial take-profit cones.',
      },
      {
        time: '11:42:00 UTC',
        stage: 'Full Cones Realized',
        detail: 'TP1 & TP2 hit, stop moved to breakeven, runner completed @ 2,916.50 for +184 pips.',
      },
    ],
  },
  {
    id: 'case-eur',
    symbol: 'EUR/USD',
    title: 'US Core PCE Inflation Deviation Short',
    tag: 'MACRO CATALYST + ORDER BLOCK',
    date: 'Thursday 12:30 UTC',
    gain: '+$2,280',
    pips: '+114 Pips',
    rr: '1:2.83',
    direction: 'SELL / SHORT',
    entry: '1.0845',
    invalidation: '1.0875',
    target1: '1.0810 (+50% scaled)',
    target2: '1.0760 (+50% scaled)',
    target3: '1.0720 (Extension)',
    committeeVoting: {
      tech: 91,
      macro: 93,
      risk: 89,
      sentiment: 84,
    },
    steps: [
      {
        time: '12:30:02 UTC',
        stage: 'Macro Wire Ingestion',
        detail: 'Core PCE print exceeds consensus at +0.3% MoM; Dollar Index explodes higher.',
      },
      {
        time: '12:30:11 UTC',
        stage: '4-Desk Deliberation',
        detail: 'Macro signals Fed rate cut delay (+93%). Technical identifies 1h bearish rejection block.',
      },
      {
        time: '12:30:19 UTC',
        stage: 'Arbitration Veto Check',
        detail: 'Risk Desk calculates 30-pip invalidation floor. Minimum 1:2.5+ R:R threshold satisfied.',
      },
      {
        time: '12:30:25 UTC',
        stage: 'Ticket Stamped & Dispatched',
        detail: 'Sell Limit executed @ 1.0845 via encrypted MetaTrader FIX bridge.',
      },
      {
        time: '16:15:00 UTC',
        stage: 'TP2 Reached',
        detail: 'Euro drops to 1.0731; trade closes out with +114 pips clean gain.',
      },
    ],
  },
  {
    id: 'case-gbp',
    symbol: 'GBP/USD',
    title: 'London AM Killzone Range Breakout',
    tag: 'SESSION LIQUIDITY + COT FLOW',
    date: 'Tuesday 08:15 UTC',
    gain: '+$2,840',
    pips: '+142 Pips',
    rr: '1:3.40',
    direction: 'BUY / LONG',
    entry: '1.2915',
    invalidation: '1.2875',
    target1: '1.2965 (+40% scaled)',
    target2: '1.3020 (+40% scaled)',
    target3: '1.3060 (+20% runner)',
    committeeVoting: {
      tech: 88,
      macro: 85,
      risk: 91,
      sentiment: 92,
    },
    steps: [
      {
        time: '08:15:08 UTC',
        stage: 'Tick Stream Ingestion',
        detail: 'Sterling reclaims previous day high during London session open volume spike.',
      },
      {
        time: '08:15:16 UTC',
        stage: '4-Desk Deliberation',
        detail: 'Whale Desk signals CFTC commercial longs at 6-month high (+92%).',
      },
      {
        time: '08:15:22 UTC',
        stage: 'Risk Boundary Guard',
        detail: '1.0% account loss constraint met with 40-pip stop loss below Asian session low.',
      },
      {
        time: '08:15:28 UTC',
        stage: 'Signed Order Card',
        detail: 'Ticket #0x3D7C91 issued with dynamic trail upon TP1 achievement.',
      },
      {
        time: '14:30:00 UTC',
        stage: '1:3.40 Target Hit',
        detail: 'Pound rallies into NY open; full 142 pips secured.',
      },
    ],
  },
  {
    id: 'case-btc',
    symbol: 'BTC/USD',
    title: 'Weekend Liquidity Cascade Reclaim',
    tag: 'ORDER FLOW + DERIVATIVES BASIS',
    date: 'Sunday 18:00 UTC',
    gain: '+$6,800',
    pips: '+3,400 Pts',
    rr: '1:4.10',
    direction: 'BUY / LONG',
    entry: '86,400',
    invalidation: '85,570',
    target1: '88,200 (+50% scaled)',
    target2: '89,800 (+50% scaled)',
    target3: '91,500 (Extension)',
    committeeVoting: {
      tech: 92,
      macro: 84,
      risk: 90,
      sentiment: 95,
    },
    steps: [
      {
        time: '18:00:15 UTC',
        stage: 'Crypto WebSocket Feed',
        detail: 'Binance perpetual funding resets negative while spot premium expands.',
      },
      {
        time: '18:00:23 UTC',
        stage: '4-Desk Deliberation',
        detail: 'Sentiment Desk detects short squeeze setup (+95%). Tech marks 4h bullish order block.',
      },
      {
        time: '18:00:30 UTC',
        stage: 'Lead Arbiter Approval',
        detail: 'Tight 830-point invalidation stop offers rare 1:4.10 asymmetric reward ratio.',
      },
      {
        time: '18:00:36 UTC',
        stage: 'Execution Ticket',
        detail: 'Long executed @ 86,400 before Sunday weekly close.',
      },
      {
        time: '23:50:00 UTC',
        stage: 'Runner Target Reached',
        detail: 'Bitcoin spikes through 89,800 into Asian Monday open; +3,400 points booked.',
      },
    ],
  },
];

export function LandingCaseStudies() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [direction, setDirection] = useState<1 | -1>(1);

  const active = CASE_STUDIES[currentIndex] ?? CASE_STUDIES[0]!;

  // 6-Second Autoplay Timer
  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      setDirection(1);
      setCurrentIndex((prev) => (prev + 1) % CASE_STUDIES.length);
    }, 6500);

    return () => clearInterval(interval);
  }, [isPaused]);

  const handleNext = () => {
    setDirection(1);
    setCurrentIndex((prev) => (prev + 1) % CASE_STUDIES.length);
  };

  const handlePrev = () => {
    setDirection(-1);
    setCurrentIndex((prev) => (prev - 1 + CASE_STUDIES.length) % CASE_STUDIES.length);
  };

  return (
    <section id="cases" className="relative py-24 bg-[#0b0c0d] border-t border-white/5 overflow-hidden">
      {/* Radial Ember Illumination */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/4 size-[700px] rounded-full bg-brand/5 blur-[140px] select-none"
      />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header with Tactical Controls */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div className="flex flex-col items-start gap-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-bull/30 bg-bull/10 px-3 py-1 text-xs font-mono">
              <span className="size-2 rounded-full bg-bull animate-pulse shadow-[0_0_8px_#3f9e3d]" />
              <span className="text-bull font-semibold uppercase tracking-wider">
                Audited Trade Replay
              </span>
            </div>

            <h2 className="font-display text-3xl font-normal tracking-[-0.03em] text-fg sm:text-5xl">
              REAL SYNDICATE EXECUTIONS{' '}
              <span className="font-redaction-35 italic text-brand">Deconstructed</span>
            </h2>
            <p className="font-sans text-sm sm:text-base text-fg-muted leading-relaxed">
              Step inside actual institutional setups arbitrated by the committee. Observe the complete transaction lifecycle from tick arrival to profit realization.
            </p>
          </div>

          {/* Carousel Controls & Autoplay Toggle */}
          <div className="flex items-center gap-3 self-start md:self-end">
            <button
              type="button"
              onClick={() => setIsPaused(!isPaused)}
              className="flex size-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-fg-subtle hover:text-fg transition-colors"
              aria-label={isPaused ? 'Resume autoplay' : 'Pause autoplay'}
              title={isPaused ? 'Resume autoplay' : 'Pause autoplay'}
            >
              {isPaused ? <IconPlayerPlay className="size-4" /> : <IconPlayerPause className="size-4" />}
            </button>

            <button
              type="button"
              onClick={handlePrev}
              className="flex size-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-fg hover:border-white/20 transition-colors"
              aria-label="Previous case study"
            >
              <IconChevronLeft className="size-5" />
            </button>

            <button
              type="button"
              onClick={handleNext}
              className="flex size-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-fg hover:border-white/20 transition-colors"
              aria-label="Next case study"
            >
              <IconChevronRight className="size-5" />
            </button>
          </div>
        </div>

        {/* Carousel Progress Navigation Scrubbers */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-8">
          {CASE_STUDIES.map((cs, idx) => {
            const isActive = idx === currentIndex;
            return (
              <button
                key={cs.id}
                type="button"
                onClick={() => {
                  setDirection(idx > currentIndex ? 1 : -1);
                  setCurrentIndex(idx);
                }}
                className={cn(
                  'relative flex flex-col p-3 rounded-xl border text-left transition-all duration-200 overflow-hidden',
                  isActive
                    ? 'border-brand/40 bg-[#161718] shadow-[var(--shadow-chip)]'
                    : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04]',
                )}
              >
                {/* Autoplay Progress Line on Active */}
                {isActive && !isPaused && (
                  <motion.div
                    className="absolute top-0 left-0 right-0 h-[2px] bg-brand shadow-[0_0_8px_#ff3616]"
                    initial={{ width: '0%' }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 6.5, ease: 'linear' }}
                    key={currentIndex}
                  />
                )}

                <div className="flex items-center justify-between font-mono text-xs">
                  <span className={cn('font-bold', isActive ? 'text-brand' : 'text-fg-subtle')}>
                    0{idx + 1} · {cs.symbol}
                  </span>
                  <span className="text-bull font-semibold tabular-nums">{cs.gain}</span>
                </div>
                <span className="font-sans text-[11px] text-fg-muted truncate mt-1">
                  {cs.title}
                </span>
              </button>
            );
          })}
        </div>

        {/* The Active Case Study Slide with Directional Slide Transition */}
        <div
          className="relative min-h-[520px]"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={active.id}
              initial={{ opacity: 0, x: direction * 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -24 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="surface-panel relative overflow-hidden rounded-2xl border border-white/15 bg-[#141516]/95 p-6 sm:p-8 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.12)]"
            >
              {/* Slide Top Metadata */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded bg-white/5 border border-white/10 text-fg uppercase">
                      {active.symbol}
                    </span>
                    <span className="font-mono text-xs text-brand font-semibold uppercase">
                      {active.tag}
                    </span>
                    <span className="hidden sm:inline-block font-mono text-xs text-fg-subtle">
                      · {active.date}
                    </span>
                  </div>
                  <h3 className="font-display text-2xl sm:text-3xl font-normal tracking-tight text-fg mt-1">
                    {active.title}
                  </h3>
                </div>

                {/* Return Metrics Pill */}
                <div className="flex items-center gap-3 shrink-0">
                  <div className="rounded-xl surface-well px-4 py-2 bg-black/50 border border-white/5 text-right font-mono">
                    <span className="text-[10px] text-fg-subtle block">AUDITED RETURN</span>
                    <span className="text-xl sm:text-2xl font-bold text-bull tabular-nums">
                      {active.gain}
                    </span>
                  </div>
                  <div className="rounded-xl surface-well px-3 py-2 bg-black/50 border border-white/5 text-center font-mono">
                    <span className="text-[10px] text-fg-subtle block">NET PIPS</span>
                    <span className="text-sm font-bold text-fg tabular-nums">{active.pips}</span>
                  </div>
                </div>
              </div>

              {/* Grid: Left Column (Trade Execution Cones) + Right Column (Step-by-Step Transaction Log) */}
              <div className="grid gap-8 lg:grid-cols-12 mt-6">
                {/* Left Column: Tactical Order Cones & Committee Scores */}
                <div className="lg:col-span-5 flex flex-col justify-between gap-6">
                  {/* Cones Box */}
                  <div className="rounded-xl surface-well p-5 border border-white/5 bg-[#0a0b0c]">
                    <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-3 font-mono text-xs">
                      <span className="text-fg-subtle uppercase">ORDER STRUCTURE</span>
                      <span className="text-bull font-bold uppercase">{active.direction} · {active.rr} R:R</span>
                    </div>

                    <div className="flex flex-col gap-2.5 font-mono text-xs tabular-nums">
                      <div className="flex items-center justify-between">
                        <span className="text-fg-subtle">ENTRY LEVEL:</span>
                        <span className="font-bold text-fg">{active.entry}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-bear">INVALIDATION STOP:</span>
                        <span className="font-bold text-bear">{active.invalidation}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-bull">TARGET 1:</span>
                        <span className="text-bull font-semibold">{active.target1}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-bull">TARGET 2:</span>
                        <span className="text-bull font-semibold">{active.target2}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-bull">RUNNER TARGET:</span>
                        <span className="text-bull font-bold">{active.target3}</span>
                      </div>
                    </div>
                  </div>

                  {/* 4-Desk Voting Scores on this Trade */}
                  <div className="rounded-xl border border-white/10 bg-[#161718] p-4">
                    <span className="font-mono text-[10px] font-bold text-fg-subtle uppercase tracking-wider block mb-3">
                      COMMITTEE VOTING MATRIX
                    </span>
                    <div className="grid grid-cols-4 gap-2 font-mono text-center text-xs">
                      <div className="rounded-lg bg-black/40 p-2 border border-white/5">
                        <span className="text-bull text-[10px] block">TECH</span>
                        <span className="font-bold text-fg">{active.committeeVoting.tech}%</span>
                      </div>
                      <div className="rounded-lg bg-black/40 p-2 border border-white/5">
                        <span className="text-info text-[10px] block">MACRO</span>
                        <span className="font-bold text-fg">{active.committeeVoting.macro}%</span>
                      </div>
                      <div className="rounded-lg bg-black/40 p-2 border border-white/5">
                        <span className="text-warn text-[10px] block">RISK</span>
                        <span className="font-bold text-fg">{active.committeeVoting.risk}%</span>
                      </div>
                      <div className="rounded-lg bg-black/40 p-2 border border-white/5">
                        <span className="text-brand text-[10px] block">WHALES</span>
                        <span className="font-bold text-fg">{active.committeeVoting.sentiment}%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column: Step-by-Step Transaction Lifecycle */}
                <div className="lg:col-span-7">
                  <div className="rounded-xl surface-well p-5 sm:p-6 border border-white/5 bg-[#090a0b]">
                    <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-5 font-mono text-xs">
                      <span className="font-bold text-fg uppercase tracking-wider flex items-center gap-2">
                        <IconClock className="size-4 text-brand" />
                        TRANSACTION EXECUTION LIFECYCLE
                      </span>
                      <span className="text-bull font-semibold flex items-center gap-1">
                        <IconCheck className="size-3.5" /> VERIFIED COMPLETE
                      </span>
                    </div>

                    {/* Timeline List */}
                    <div className="flex flex-col gap-4">
                      {active.steps.map((step, sIdx) => (
                        <div key={sIdx} className="flex items-start gap-3 text-xs">
                          {/* Circle Dot with Connecting Line */}
                          <div className="flex flex-col items-center">
                            <div className="size-2.5 rounded-full bg-brand shadow-[0_0_6px_#ff3616] mt-1" />
                            {sIdx < active.steps.length - 1 && (
                              <div className="w-[1px] h-8 bg-white/10 my-1" />
                            )}
                          </div>

                          <div className="flex flex-col gap-0.5 w-full">
                            <div className="flex items-baseline justify-between">
                              <span className="font-mono text-[11px] font-bold text-fg">
                                {step.stage}
                              </span>
                              <span className="font-mono text-[10px] text-fg-subtle tabular-nums">
                                {step.time}
                              </span>
                            </div>
                            <p className="font-sans text-fg-muted leading-relaxed">
                              {step.detail}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
