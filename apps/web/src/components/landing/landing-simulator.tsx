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
  IconAlertTriangle,
  IconCheck,
  IconCopy,
  IconLock,
  IconPlayerPlay,
  IconRefresh,
  IconSend,
  IconTerminal2,
} from '@tabler/icons-react';
import { AnimatePresence, m } from 'motion/react';
import Image from 'next/image';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/formatters/cn';

interface Scenario {
  id: string;
  name: string;
  symbol: string;
  catalyst: string;
  action: 'BUY / LONG' | 'SELL / SHORT';
  orderType: string;
  entry: string;
  invalidation: string;
  target1: string;
  target2: string;
  target3: string;
  rr: string;
  expectedValue: string;
  kellySize: string;
  techScore: number;
  macroScore: number;
  riskScore: number;
  sentimentScore: number;
  consensusScore: number;
  bullProbability: number;
  arbiterVerdict: string;
  txHash: string;
  journalSummary: string;
}

const SCENARIOS: Scenario[] = [
  {
    id: 'london-sweep',
    name: 'London Fix Liquidity Sweep',
    symbol: 'XAU/USD',
    catalyst: 'Asia session low swept into 15m Bullish Fair Value Gap + NY Open Displacement',
    action: 'BUY / LONG',
    orderType: 'LIMIT SETUP',
    entry: '2,864.20',
    invalidation: '2,846.50',
    target1: '2,884.00',
    target2: '2,908.50',
    target3: '2,936.00',
    rr: '1:3.64',
    expectedValue: '+2.88R',
    kellySize: '0.85% equity',
    techScore: 94,
    macroScore: 88,
    riskScore: 92,
    sentimentScore: 86,
    consensusScore: 90,
    bullProbability: 88,
    arbiterVerdict:
      'Unanimous 4-Desk Consensus. Asymmetric Long Setup Confirmed. Scale 40% at TP1 and trail stop behind the 15m swing low.',
    txHash: 'KSL-XAU-8F4A21',
    journalSummary:
      'Setup: XAU/USD Long @ 2,864.20 | Stop: 2,846.50 (0.85% Risk) | Targets: 2,884.00 / 2,908.50 / 2,936.00 | Alerts Armed: Telegram, Push & Email',
  },
  {
    id: 'pce-beat',
    name: 'US Core PCE Inflation Print',
    symbol: 'EUR/USD',
    catalyst:
      'US 10Y Yields steepen +4.8 bps; Dollar Index rejects Daily 200 EMA with bearish engulfing',
    action: 'SELL / SHORT',
    orderType: 'BREAKOUT SETUP',
    entry: '1.0845',
    invalidation: '1.0875',
    target1: '1.0810',
    target2: '1.0760',
    target3: '1.0715',
    rr: '1:2.95',
    expectedValue: '+2.14R',
    kellySize: '0.75% equity',
    techScore: 91,
    macroScore: 93,
    riskScore: 89,
    sentimentScore: 84,
    consensusScore: 89,
    bullProbability: 16,
    arbiterVerdict:
      'Macro Rate Divergence Confirmed. Institutional liquidity sweep at 1.0850 tapped. Short plan validated with a strict 30-pip invalidation.',
    txHash: 'KSL-EUR-3D7C91',
    journalSummary:
      'Setup: EUR/USD Short @ 1.0845 | Stop: 1.0875 (0.75% Risk) | Targets: 1.0810 / 1.0760 / 1.0715 | Alerts Armed: Telegram, Push & Email',
  },
  {
    id: 'safe-haven',
    name: 'Geopolitical Flight to Quality',
    symbol: 'XAU/USD',
    catalyst:
      'Central Bank sovereign bullion accumulation + aggressive institutional flight to safety',
    action: 'BUY / LONG',
    orderType: 'MOMENTUM SETUP',
    entry: '2,870.00',
    invalidation: '2,852.00',
    target1: '2,900.00',
    target2: '2,945.00',
    target3: '2,990.00',
    rr: '1:4.44',
    expectedValue: '+3.72R',
    kellySize: '0.90% equity',
    techScore: 89,
    macroScore: 96,
    riskScore: 90,
    sentimentScore: 94,
    consensusScore: 92,
    bullProbability: 92,
    arbiterVerdict:
      'Institutional Whale Accumulation. Sovereign bullion ETF inflows +24 tons. Multi-target runner plan approved.',
    txHash: 'KSL-XAU-EE92B4',
    journalSummary:
      'Setup: XAU/USD Long @ 2,870.00 | Stop: 2,852.00 (0.90% Risk) | Targets: 2,900.00 / 2,945.00 / 2,990.00 | Alerts Armed: Telegram, Push & Email',
  },
];

export function LandingSimulator() {
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('london-sweep');
  const [simulationStage, setSimulationStage] = useState<
    'idle' | 'voting' | 'verdict' | 'dispatching' | 'dispatched'
  >('idle');
  const [riskSlider, setRiskSlider] = useState<number>(1.0);
  const [copiedHash, setCopiedHash] = useState(false);

  const scenario = SCENARIOS.find((s) => s.id === selectedScenarioId) ?? SCENARIOS[0]!;
  const isVetoed = riskSlider > 1.0;

  const handleRunDeliberation = () => {
    setSimulationStage('voting');

    setTimeout(() => {
      setSimulationStage('verdict');
    }, 1100);
  };

  const handleDispatchBridge = () => {
    setSimulationStage('dispatching');
    setTimeout(() => {
      setSimulationStage('dispatched');
    }, 850);
  };

  const handleReset = () => {
    setSimulationStage('idle');
    setCopiedHash(false);
  };

  const handleCopyHash = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  return (
    <section
      id="simulator"
      className="relative overflow-hidden border-t border-white/5 bg-[#0d0e0f] py-28 lg:py-36"
    >
      {/* ── Neoclassical Cybernetic Astrolabe Artwork ── */}
      <div
        aria-hidden="true"
        className="simulator-backdrop-mask pointer-events-none absolute top-4 right-0 z-0 h-[380px] w-full opacity-20 mix-blend-screen select-none sm:top-8 sm:h-[480px] lg:top-8 lg:right-4 lg:h-[620px] lg:w-[46%] lg:opacity-30"
      >
        <Image
          src="/landing/simulator-astrolabe.webp"
          alt="Antikythera Celestial Calculation Engine"
          fill
          unoptimized
          sizes="(max-width: 1024px) 100vw, 46vw"
          className="object-contain object-top lg:object-contain lg:object-right-top"
        />
      </div>

      {/* Background Radial Ambient Glow */}
      <div
        aria-hidden="true"
        className="bg-brand/10 pointer-events-none absolute -bottom-20 left-1/2 size-[800px] -translate-x-1/2 rounded-full blur-[160px] select-none"
      />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto mb-14 flex max-w-3xl flex-col items-center gap-4 text-center">
          <div className="border-brand/30 bg-brand/10 inline-flex items-center gap-2 rounded-full border px-3.5 py-1 font-mono text-xs shadow-[0_0_12px_rgba(255,54,22,0.2)]">
            <span className="bg-brand size-2 animate-pulse rounded-full" />
            <span className="text-brand font-semibold tracking-wider uppercase">
              Interactive Committee Simulator
            </span>
          </div>

          <h2 className="font-display text-fg text-3xl font-normal tracking-[-0.03em] sm:text-5xl">
            TEST THE 4-DESK{' '}
            <span className="font-redaction-35 text-brand italic">Decision Loop</span>
          </h2>
          <p className="text-fg-muted font-sans text-base leading-relaxed">
            Pick a real market scenario below and run the 4-desk analysis. Test how Kestrel scores
            conviction, blocks unsafe risk above 1.0%, and builds a complete trade plan ready for
            your journal and price alerts.
          </p>
        </div>

        {/* Scenario Pill Selector */}
        <div
          role="tablist"
          aria-label="Market scenarios"
          className="mb-10 flex flex-wrap items-center justify-center gap-2"
        >
          {SCENARIOS.map((sc) => {
            const isSelected = sc.id === selectedScenarioId;
            return (
              <button
                key={sc.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => {
                  setSelectedScenarioId(sc.id);
                  setSimulationStage('idle');
                }}
                className={cn(
                  'relative rounded-xl border px-4 py-2.5 font-mono text-xs font-semibold transition-all duration-200 active:translate-y-[0.5px]',
                  isSelected
                    ? 'border-brand/40 bg-brand/10 text-brand shadow-[0_0_16px_rgba(255,54,22,0.15)]'
                    : 'text-fg-muted hover:text-fg border-white/5 bg-white/[0.02] hover:border-white/10',
                )}
              >
                {isSelected && (
                  <m.div
                    layoutId="scenario-pill-glow"
                    className="border-brand/50 bg-brand/5 absolute inset-0 -z-10 rounded-xl border"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <span>{sc.name}</span>
                <span className="text-fg-subtle ml-2">({sc.symbol})</span>
              </button>
            );
          })}
        </div>

        {/* Main Interactive Simulator Console */}
        <div className="surface-panel relative overflow-hidden rounded-2xl border border-white/15 bg-[#121314]/95 p-6 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.12)] sm:p-8">
          {/* Top Bar: Event Catalyst & Deliberation Trigger */}
          <div className="flex flex-col justify-between gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-center">
            <div className="flex max-w-2xl flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-brand font-mono text-[11px] font-bold tracking-wider uppercase">
                  MARKET SCENARIO · {scenario.symbol}
                </span>
                <span className="text-fg-subtle py-0.2 rounded border border-white/10 bg-black/40 px-1.5 font-mono text-[10px]">
                  {scenario.orderType}
                </span>
              </div>
              <span className="text-fg font-sans text-sm font-medium">{scenario.catalyst}</span>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              {simulationStage === 'idle' ? (
                <Button
                  variant="tactical"
                  size="md"
                  onClick={handleRunDeliberation}
                  className="gap-2 font-mono text-xs font-semibold shadow-sm"
                >
                  <IconPlayerPlay className="size-4" />
                  Run 4-Desk Analysis
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="md"
                  onClick={handleReset}
                  className="gap-2 border-white/15 font-mono text-xs hover:bg-white/5"
                >
                  <IconRefresh className="size-4" />
                  Reset Simulation
                </Button>
              )}
            </div>
          </div>

          {/* 4 Specialist Desks Voting Grid */}
          <div className="my-8">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-fg-subtle font-mono text-xs font-bold tracking-wider uppercase">
                4-DESK CONVICTION BREAKDOWN
              </span>
              <span className="text-brand flex items-center gap-2 font-mono text-xs font-semibold">
                {simulationStage === 'voting' && (
                  <>
                    <span className="bg-brand size-2 animate-ping rounded-full" />
                    <span>ANALYZING MARKET STRUCTURE & MACRO...</span>
                  </>
                )}
                {simulationStage !== 'voting' && simulationStage !== 'idle' && (
                  <span>COMMITTEE CONSENSUS ({scenario.consensusScore}%)</span>
                )}
                {simulationStage === 'idle' && <span>READY TO ANALYZE</span>}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {/* Desk 1: Technical */}
              <div className="surface-chip rounded-xl border border-white/10 bg-[#161718] p-4">
                <div className="mb-2 flex items-center justify-between font-mono text-xs">
                  <span className="text-bull font-bold uppercase">Technical</span>
                  <span className="text-fg font-bold tabular-nums">
                    {simulationStage === 'idle' ? '--' : `${scenario.techScore}%`}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/5">
                  <m.div
                    className="bg-bull h-full rounded-full"
                    initial={{ width: 0 }}
                    animate={{
                      width: simulationStage !== 'idle' ? `${scenario.techScore}%` : '0%',
                    }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                  />
                </div>
                <p className="text-fg-muted mt-2 truncate font-sans text-[11px]">
                  FVG Retest & Session Sweep
                </p>
              </div>

              {/* Desk 2: Macro */}
              <div className="surface-chip rounded-xl border border-white/10 bg-[#161718] p-4">
                <div className="mb-2 flex items-center justify-between font-mono text-xs">
                  <span className="text-info font-bold uppercase">Macro</span>
                  <span className="text-fg font-bold tabular-nums">
                    {simulationStage === 'idle' ? '--' : `${scenario.macroScore}%`}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/5">
                  <m.div
                    className="bg-info h-full rounded-full"
                    initial={{ width: 0 }}
                    animate={{
                      width: simulationStage !== 'idle' ? `${scenario.macroScore}%` : '0%',
                    }}
                    transition={{ duration: 0.9, ease: 'easeOut', delay: 0.1 }}
                  />
                </div>
                <p className="text-fg-muted mt-2 truncate font-sans text-[11px]">
                  Yields, DXY & Rate Catalysts
                </p>
              </div>

              {/* Desk 3: Risk */}
              <div className="surface-chip rounded-xl border border-white/10 bg-[#161718] p-4">
                <div className="mb-2 flex items-center justify-between font-mono text-xs">
                  <span className="text-warn font-bold uppercase">Risk</span>
                  <span
                    className={cn('font-bold tabular-nums', isVetoed ? 'text-bear' : 'text-fg')}
                  >
                    {simulationStage === 'idle'
                      ? '--'
                      : isVetoed
                        ? 'VETO'
                        : `${scenario.riskScore}%`}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/5">
                  <m.div
                    className={cn(
                      'h-full rounded-full transition-colors duration-300',
                      isVetoed ? 'bg-bear' : 'bg-warn',
                    )}
                    initial={{ width: 0 }}
                    animate={{
                      width:
                        simulationStage !== 'idle'
                          ? isVetoed
                            ? '100%'
                            : `${scenario.riskScore}%`
                          : '0%',
                    }}
                    transition={{ duration: 0.7, ease: 'easeOut', delay: 0.2 }}
                  />
                </div>
                <p className="text-fg-muted mt-2 truncate font-sans text-[11px]">
                  {isVetoed ? 'Risk Limit Exceeded (>1.0%)' : 'Within 1.0% Risk Guardrail'}
                </p>
              </div>

              {/* Desk 4: Sentiment */}
              <div className="surface-chip rounded-xl border border-white/10 bg-[#161718] p-4">
                <div className="mb-2 flex items-center justify-between font-mono text-xs">
                  <span className="text-brand font-bold uppercase">Whales</span>
                  <span className="text-fg font-bold tabular-nums">
                    {simulationStage === 'idle' ? '--' : `${scenario.sentimentScore}%`}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/5">
                  <m.div
                    className="bg-brand h-full rounded-full"
                    initial={{ width: 0 }}
                    animate={{
                      width: simulationStage !== 'idle' ? `${scenario.sentimentScore}%` : '0%',
                    }}
                    transition={{ duration: 0.85, ease: 'easeOut', delay: 0.15 }}
                  />
                </div>
                <p className="text-fg-muted mt-2 truncate font-sans text-[11px]">
                  CFTC Institutional Positioning
                </p>
              </div>
            </div>

            {/* Dynamic Tug-of-War Directional Probability Bar */}
            {simulationStage !== 'idle' && (
              <m.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="mt-5 rounded-xl border border-white/5 bg-black/40 p-3"
              >
                <div className="mb-2 flex items-center justify-between font-mono text-[11px]">
                  <span className="text-bull flex items-center gap-1.5 font-semibold">
                    <span className="bg-bull size-1.5 rounded-full" />
                    BULLISH PROBABILITY {scenario.bullProbability}%
                  </span>
                  <span className="text-fg-subtle">COMMITTEE BIAS BALANCE</span>
                  <span className="text-bear flex items-center gap-1.5 font-semibold">
                    BEARISH PROBABILITY {100 - scenario.bullProbability}%
                    <span className="bg-bear size-1.5 rounded-full" />
                  </span>
                </div>
                <div className="flex h-1.5 overflow-hidden rounded-full bg-white/10">
                  <m.div
                    className="bg-bull h-full"
                    initial={{ width: '50%' }}
                    animate={{ width: `${scenario.bullProbability}%` }}
                    transition={{ duration: 0.9, ease: 'easeOut' }}
                  />
                  <m.div
                    className="bg-bear h-full"
                    initial={{ width: '50%' }}
                    animate={{ width: `${100 - scenario.bullProbability}%` }}
                    transition={{ duration: 0.9, ease: 'easeOut' }}
                  />
                </div>
              </m.div>
            )}
          </div>

          {/* Interactive Risk Tolerance Slider & Veto Governor */}
          <div
            className={cn(
              'surface-well my-6 rounded-xl border p-4 transition-all duration-300 sm:p-5',
              isVetoed
                ? 'border-bear/50 bg-bear/[0.05] shadow-[0_0_20px_rgba(224,44,16,0.15)]'
                : 'border-white/10 bg-[#090a0b]',
            )}
          >
            <div className="mb-3 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
              <div>
                <span className="text-fg flex items-center gap-2 font-mono text-xs font-bold tracking-wider uppercase">
                  <IconLock className="text-brand size-3.5" />
                  PORTFOLIO RISK GUARDRAIL (1.0% MAX LOSS)
                </span>
                <span className="text-fg-muted mt-0.5 block font-sans text-xs">
                  Drag the slider above 1.0% to see how Kestrel blocks oversized risk before you
                  place a trade.
                </span>
              </div>
              <div className="shrink-0 font-mono text-xs font-bold">
                RISK PER TRADE:{' '}
                <span
                  className={cn(
                    'font-mono font-black tabular-nums',
                    isVetoed ? 'text-bear' : 'text-bull',
                  )}
                >
                  {riskSlider.toFixed(1)}%
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-fg-subtle font-mono text-xs">0.5%</span>
              <input
                type="range"
                min="0.5"
                max="2.5"
                step="0.1"
                value={riskSlider}
                aria-label="Max account risk percentage"
                aria-valuemin={0.5}
                aria-valuemax={2.5}
                aria-valuenow={riskSlider}
                onChange={(e) => setRiskSlider(parseFloat(e.target.value))}
                className="accent-brand w-full cursor-pointer"
              />
              <span className="text-fg-subtle font-mono text-xs">2.5%</span>
            </div>

            {isVetoed && (
              <m.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-bear/15 border-bear/40 text-bear mt-3.5 flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 font-mono text-xs"
              >
                <div className="flex items-center gap-2">
                  <IconAlertTriangle className="size-4 shrink-0 animate-bounce" />
                  <span>
                    <strong>RISK GUARDRAIL TRIGGERED:</strong> {riskSlider.toFixed(1)}% risk exceeds
                    your 1.0% maximum drawdown rule. Trade plan paused.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setRiskSlider(1.0)}
                  className="bg-bear/20 hover:bg-bear/30 border-bear/40 cursor-pointer rounded border px-2.5 py-1 text-[11px] font-bold underline transition-colors"
                >
                  Restore 1.0% Limit
                </button>
              </m.div>
            )}
          </div>

          {/* Verdict and Trade Plan Ticket */}
          <AnimatePresence mode="wait">
            {simulationStage === 'verdict' && isVetoed && (
              <m.div
                key="verdict-vetoed-card"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.3 }}
                className="border-bear/50 bg-bear/[0.04] rounded-xl border p-5 shadow-xl sm:p-6"
              >
                <div className="border-bear/20 flex flex-col justify-between gap-4 border-b pb-4 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-3">
                    <span className="bg-bear size-3 animate-ping rounded-full" />
                    <div>
                      <div className="text-bear font-mono text-sm font-bold tracking-wider uppercase">
                        SETUP BLOCKED BY RISK GUARDRAIL
                      </div>
                      <div className="text-fg-subtle font-mono text-[11px]">
                        REASON: PROPOSED {riskSlider.toFixed(1)}% RISK EXCEEDS YOUR 1.0% MAXIMUM
                        RISK PER TRADE
                      </div>
                    </div>
                  </div>
                  <span className="text-bear bg-bear/10 border-bear/30 rounded-full border px-3 py-1 text-center font-mono text-xs font-bold uppercase">
                    RISK VETO ACTIVE
                  </span>
                </div>

                <div className="surface-well border-bear/20 text-fg-muted mt-4 rounded-lg border bg-black/60 p-4 font-sans text-xs leading-relaxed">
                  Kestrel&apos;s Risk Desk protects your account from emotional over-sizing. Lower
                  the risk slider back to ≤ 1.0% to unlock the verified trade plan and target
                  levels.
                </div>

                <div className="mt-4 flex items-center justify-between pt-2">
                  <span className="text-fg-subtle font-mono text-[11px]">
                    DRAWDOWN PROTECTION ACTIVE · CAPITAL PRESERVED
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setRiskSlider(1.0)}
                    className="text-bull border-bull/30 hover:bg-bull/10 font-mono text-xs"
                  >
                    Restore 1.0% Limit
                  </Button>
                </div>
              </m.div>
            )}

            {simulationStage === 'verdict' && !isVetoed && (
              <m.div
                key="verdict-card"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.3 }}
                className="border-brand/40 bg-brand/[0.03] rounded-xl border p-5 shadow-xl sm:p-6"
              >
                {/* Certified Trade Plan Header */}
                <div className="flex flex-col justify-between gap-4 border-b border-white/10 pb-4 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-3">
                    <span className="bg-bull size-3 rounded-full shadow-[0_0_8px_#3f9e3d]" />
                    <div>
                      <div className="text-fg flex items-center gap-2 font-mono text-sm font-bold uppercase">
                        <span>VERIFIED COMMITTEE TRADE PLAN · {scenario.symbol}</span>
                        <span className="text-brand bg-brand/10 border-brand/20 rounded border px-2 py-0.5 font-mono text-[10px]">
                          {scenario.orderType}
                        </span>
                      </div>
                      <div className="text-fg-subtle mt-0.5 flex items-center gap-2 font-mono text-[11px]">
                        <span>PLAN ID: {scenario.txHash}</span>
                        <button
                          type="button"
                          onClick={() => handleCopyHash(scenario.journalSummary)}
                          className="hover:text-fg transition-colors"
                          title="Copy Trade Setup"
                        >
                          {copiedHash ? (
                            <IconCheck className="text-bull inline size-3" />
                          ) : (
                            <IconCopy className="inline size-3" />
                          )}
                        </button>
                        <span>· STATUS: 4-DESK CONSENSUS VERIFIED</span>
                      </div>
                    </div>
                  </div>

                  <span
                    className={cn(
                      'shrink-0 rounded-full border px-3 py-1 text-center font-mono text-xs font-bold uppercase',
                      scenario.action.startsWith('BUY')
                        ? 'text-bull bg-bull/10 border-bull/30 shadow-[0_0_12px_rgba(63,158,61,0.2)]'
                        : 'text-bear bg-bear/10 border-bear/30 shadow-[0_0_12px_rgba(224,44,16,0.2)]',
                    )}
                  >
                    {scenario.action}
                  </span>
                </div>

                {/* Quantitative Levels Grid */}
                <div className="mt-5 grid grid-cols-2 gap-3 text-center font-mono sm:grid-cols-4">
                  <div className="surface-well rounded-lg border border-white/5 bg-black/60 p-3.5">
                    <span className="text-fg-subtle block text-[10px] uppercase">ENTRY ZONE</span>
                    <span className="text-fg text-base font-bold tabular-nums">
                      {scenario.entry}
                    </span>
                  </div>
                  <div className="surface-well border-bear/20 rounded-lg border bg-black/60 p-3.5">
                    <span className="text-bear block text-[10px] uppercase">INVALIDATION (SL)</span>
                    <span className="text-bear text-base font-bold tabular-nums">
                      {scenario.invalidation}
                    </span>
                  </div>
                  <div className="surface-well rounded-lg border border-white/5 bg-black/60 p-3.5">
                    <span className="text-bull block text-[10px] uppercase">TP1 (40% SCALE)</span>
                    <span className="text-bull text-base font-bold tabular-nums">
                      {scenario.target1}
                    </span>
                  </div>
                  <div className="surface-well rounded-lg border border-white/5 bg-black/60 p-3.5">
                    <span className="text-bull block text-[10px] uppercase">
                      TP2 RUNNER ({scenario.rr})
                    </span>
                    <span className="text-bull text-base font-bold tabular-nums">
                      {scenario.target2}
                    </span>
                  </div>
                </div>

                {/* Take Profit Cones Visual Breakdown */}
                <div className="mt-5 rounded-xl border border-white/5 bg-[#0e0f10] p-4">
                  <div className="mb-3 flex items-center justify-between font-mono text-xs">
                    <span className="text-fg-subtle uppercase">TAKE-PROFIT SCALING PLAN</span>
                    <span className="text-fg font-bold">
                      EXPECTED VALUE: {scenario.expectedValue} · RECOMMENDED RISK:{' '}
                      {scenario.kellySize}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 font-mono text-xs">
                    <div className="rounded-lg border border-white/10 bg-black/40 p-2.5">
                      <div className="text-fg-subtle text-[10px]">TARGET 1 (1:1.5)</div>
                      <div className="text-bull mt-1 font-bold">{scenario.target1}</div>
                      <div className="text-fg-muted mt-0.5 text-[10px]">Scale Out 40%</div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/40 p-2.5">
                      <div className="text-fg-subtle text-[10px]">TARGET 2 (1:2.5)</div>
                      <div className="text-bull mt-1 font-bold">{scenario.target2}</div>
                      <div className="text-fg-muted mt-0.5 text-[10px]">Scale Out 35%</div>
                    </div>
                    <div className="border-brand/30 bg-brand/[0.04] rounded-lg border p-2.5">
                      <div className="text-brand text-[10px] font-bold">
                        TARGET 3 RUNNER (1:4.0)
                      </div>
                      <div className="text-bull mt-1 font-bold">{scenario.target3}</div>
                      <div className="text-fg-muted mt-0.5 text-[10px]">Trail Remaining 25%</div>
                    </div>
                  </div>
                </div>

                {/* Committee Verdict Rationale & Action Dispatch */}
                <div className="mt-5 flex flex-col justify-between gap-4 border-t border-white/10 pt-4 sm:flex-row sm:items-center">
                  <div className="flex max-w-xl flex-col gap-1.5">
                    <p className="text-fg-muted font-sans text-xs leading-relaxed">
                      &ldquo;{scenario.arbiterVerdict}&rdquo;
                    </p>
                    <span className="text-fg-subtle font-mono text-[10px]">
                      Direct Broker Bridge (MT5 / cTrader) — Planned on Roadmap
                    </span>
                  </div>

                  <Button
                    variant="tactical"
                    size="md"
                    onClick={handleDispatchBridge}
                    className="shrink-0 gap-2 font-mono text-xs font-semibold shadow-md"
                  >
                    <IconSend className="size-4" />
                    Save to Journal & Arm Alerts
                  </Button>
                </div>
              </m.div>
            )}

            {simulationStage === 'dispatching' && (
              <m.div
                key="dispatching-card"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="border-brand/40 rounded-xl border bg-black/80 p-6 shadow-2xl"
              >
                <div className="text-brand mb-4 flex items-center gap-3 font-mono text-xs">
                  <IconTerminal2 className="size-4 animate-spin" />
                  <span>LOGGING SETUP TO TRADE JOURNAL & ARMING PRICE ALERTS...</span>
                </div>
                <div className="surface-well text-bull/90 overflow-x-auto rounded-lg border border-white/10 bg-[#08090a] p-4 font-mono text-[11px]">
                  <code>{scenario.journalSummary}</code>
                </div>
                <div className="text-fg-subtle mt-3 flex items-center justify-between font-mono text-[11px]">
                  <span>CHANNELS: TELEGRAM · BROWSER PUSH · EMAIL</span>
                  <span>R-MULTIPLE TRACKING ENABLED</span>
                </div>
              </m.div>
            )}

            {simulationStage === 'dispatched' && (
              <m.div
                key="dispatched-card"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="border-bull/40 bg-bull/[0.05] rounded-xl border p-6 text-center shadow-xl"
              >
                <div className="bg-bull/20 border-bull/40 text-bull mx-auto mb-3 flex size-12 items-center justify-center rounded-full border shadow-[0_0_16px_rgba(63,158,61,0.25)]">
                  <IconCheck className="size-6" />
                </div>
                <h4 className="font-display text-fg text-xl font-normal tracking-tight">
                  SETUP LOGGED TO JOURNAL & PRICE ALERTS ARMED
                </h4>
                <p className="text-fg-muted mx-auto mt-2 max-w-lg font-mono text-xs leading-relaxed">
                  Plan {scenario.txHash} has been saved to your Trade Journal with R-multiple
                  targets and instant Telegram, Browser Push, and Email alerts armed at Entry (
                  {scenario.entry}), Invalidation ({scenario.invalidation}), and TP1 (
                  {scenario.target1}).
                </p>

                <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleCopyHash(scenario.journalSummary)}
                    className="gap-1.5 border-white/10 font-mono text-xs"
                  >
                    {copiedHash ? (
                      <IconCheck className="text-bull size-3.5" />
                    ) : (
                      <IconCopy className="size-3.5" />
                    )}
                    <span>{copiedHash ? 'Setup Copied!' : 'Copy Trade Plan Summary'}</span>
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleReset}
                    className="border-white/10 font-mono text-xs"
                  >
                    Simulate Another Scenario
                  </Button>
                </div>
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
