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
import { m, AnimatePresence } from 'motion/react';
import {
  IconPlayerPlay,
  IconCheck,
  IconAlertTriangle,
  IconSend,
  IconRefresh,
  IconCopy,
  IconLock,
  IconTerminal2,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

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
    arbiterVerdict: 'Unanimous 4-Desk Consensus. Asymmetric Long Setup Confirmed. Scale 40% at TP1 and trail stop behind the 15m swing low.',
    txHash: 'KSL-XAU-8F4A21',
    journalSummary: 'Setup: XAU/USD Long @ 2,864.20 | Stop: 2,846.50 (0.85% Risk) | Targets: 2,884.00 / 2,908.50 / 2,936.00 | Alerts Armed: Telegram, Push & Email',
  },
  {
    id: 'pce-beat',
    name: 'US Core PCE Inflation Print',
    symbol: 'EUR/USD',
    catalyst: 'US 10Y Yields steepen +4.8 bps; Dollar Index rejects Daily 200 EMA with bearish engulfing',
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
    arbiterVerdict: 'Macro Rate Divergence Confirmed. Institutional liquidity sweep at 1.0850 tapped. Short plan validated with a strict 30-pip invalidation.',
    txHash: 'KSL-EUR-3D7C91',
    journalSummary: 'Setup: EUR/USD Short @ 1.0845 | Stop: 1.0875 (0.75% Risk) | Targets: 1.0810 / 1.0760 / 1.0715 | Alerts Armed: Telegram, Push & Email',
  },
  {
    id: 'safe-haven',
    name: 'Geopolitical Flight to Quality',
    symbol: 'XAU/USD',
    catalyst: 'Central Bank sovereign bullion accumulation + aggressive institutional flight to safety',
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
    arbiterVerdict: 'Institutional Whale Accumulation. Sovereign bullion ETF inflows +24 tons. Multi-target runner plan approved.',
    txHash: 'KSL-XAU-EE92B4',
    journalSummary: 'Setup: XAU/USD Long @ 2,870.00 | Stop: 2,852.00 (0.90% Risk) | Targets: 2,900.00 / 2,945.00 / 2,990.00 | Alerts Armed: Telegram, Push & Email',
  },
];

export function LandingSimulator() {
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('london-sweep');
  const [simulationStage, setSimulationStage] = useState<'idle' | 'voting' | 'verdict' | 'dispatching' | 'dispatched'>('idle');
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
    <section id="simulator" className="relative py-28 lg:py-36 bg-[#0d0e0f] border-t border-white/5 overflow-hidden">
      {/* Background Radial Ambient Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-20 left-1/2 -translate-x-1/2 size-[800px] rounded-full bg-brand/10 blur-[160px] select-none"
      />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col items-center text-center gap-4 mb-14 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3.5 py-1 text-xs font-mono shadow-[0_0_12px_rgba(255,54,22,0.2)]">
            <span className="size-2 rounded-full bg-brand animate-pulse" />
            <span className="text-brand font-semibold uppercase tracking-wider">
              Interactive Committee Simulator
            </span>
          </div>

          <h2 className="font-display text-3xl font-normal tracking-[-0.03em] text-fg sm:text-5xl">
            TEST THE 4-DESK{' '}
            <span className="font-redaction-35 italic text-brand">Decision Loop</span>
          </h2>
          <p className="font-sans text-base text-fg-muted leading-relaxed">
            Pick a real market scenario below and run the 4-desk analysis. Test how Kestrel scores conviction, blocks unsafe risk above 1.0%, and builds a complete trade plan ready for your journal and price alerts.
          </p>
        </div>

        {/* Scenario Pill Selector */}
        <div
          role="tablist"
          aria-label="Market scenarios"
          className="flex flex-wrap items-center justify-center gap-2 mb-10"
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
                  'relative rounded-xl px-4 py-2.5 font-mono text-xs font-semibold transition-all duration-200 border active:translate-y-[0.5px]',
                  isSelected
                    ? 'border-brand/40 bg-brand/10 text-brand shadow-[0_0_16px_rgba(255,54,22,0.15)]'
                    : 'border-white/5 bg-white/[0.02] text-fg-muted hover:border-white/10 hover:text-fg',
                )}
              >
                {isSelected && (
                  <m.div
                    layoutId="scenario-pill-glow"
                    className="absolute inset-0 rounded-xl border border-brand/50 bg-brand/5 -z-10"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <span>{sc.name}</span>
                <span className="ml-2 text-fg-subtle">({sc.symbol})</span>
              </button>
            );
          })}
        </div>

        {/* Main Interactive Simulator Console */}
        <div className="surface-panel relative overflow-hidden rounded-2xl border border-white/15 bg-[#121314]/95 p-6 sm:p-8 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.12)]">
          {/* Top Bar: Event Catalyst & Deliberation Trigger */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
            <div className="flex flex-col gap-1 max-w-2xl">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] font-bold text-brand uppercase tracking-wider">
                  MARKET SCENARIO · {scenario.symbol}
                </span>
                <span className="font-mono text-[10px] text-fg-subtle border border-white/10 rounded px-1.5 py-0.2 bg-black/40">
                  {scenario.orderType}
                </span>
              </div>
              <span className="font-sans text-sm font-medium text-fg">
                {scenario.catalyst}
              </span>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {simulationStage === 'idle' ? (
                <Button
                  variant="tactical"
                  size="md"
                  onClick={handleRunDeliberation}
                  className="font-mono text-xs font-semibold gap-2 shadow-sm"
                >
                  <IconPlayerPlay className="size-4" />
                  Run 4-Desk Analysis
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="md"
                  onClick={handleReset}
                  className="font-mono text-xs gap-2 border-white/15 hover:bg-white/5"
                >
                  <IconRefresh className="size-4" />
                  Reset Simulation
                </Button>
              )}
            </div>
          </div>

          {/* 4 Specialist Desks Voting Grid */}
          <div className="my-8">
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-xs font-bold text-fg-subtle uppercase tracking-wider">
                4-DESK CONVICTION BREAKDOWN
              </span>
              <span className="font-mono text-xs text-brand font-semibold flex items-center gap-2">
                {simulationStage === 'voting' && (
                  <>
                    <span className="size-2 rounded-full bg-brand animate-ping" />
                    <span>ANALYZING MARKET STRUCTURE & MACRO...</span>
                  </>
                )}
                {simulationStage !== 'voting' && simulationStage !== 'idle' && (
                  <span>COMMITTEE CONSENSUS ({scenario.consensusScore}%)</span>
                )}
                {simulationStage === 'idle' && <span>READY TO ANALYZE</span>}
              </span>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Desk 1: Technical */}
              <div className="surface-chip rounded-xl p-4 border border-white/10 bg-[#161718]">
                <div className="flex items-center justify-between font-mono text-xs mb-2">
                  <span className="text-bull font-bold uppercase">Technical</span>
                  <span className="text-fg tabular-nums font-bold">
                    {simulationStage === 'idle' ? '--' : `${scenario.techScore}%`}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <m.div
                    className="h-full bg-bull rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: simulationStage !== 'idle' ? `${scenario.techScore}%` : '0%' }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                  />
                </div>
                <p className="mt-2 font-sans text-[11px] text-fg-muted truncate">
                  FVG Retest & Session Sweep
                </p>
              </div>

              {/* Desk 2: Macro */}
              <div className="surface-chip rounded-xl p-4 border border-white/10 bg-[#161718]">
                <div className="flex items-center justify-between font-mono text-xs mb-2">
                  <span className="text-info font-bold uppercase">Macro</span>
                  <span className="text-fg tabular-nums font-bold">
                    {simulationStage === 'idle' ? '--' : `${scenario.macroScore}%`}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <m.div
                    className="h-full bg-info rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: simulationStage !== 'idle' ? `${scenario.macroScore}%` : '0%' }}
                    transition={{ duration: 0.9, ease: 'easeOut', delay: 0.1 }}
                  />
                </div>
                <p className="mt-2 font-sans text-[11px] text-fg-muted truncate">
                  Yields, DXY & Rate Catalysts
                </p>
              </div>

              {/* Desk 3: Risk */}
              <div className="surface-chip rounded-xl p-4 border border-white/10 bg-[#161718]">
                <div className="flex items-center justify-between font-mono text-xs mb-2">
                  <span className="text-warn font-bold uppercase">Risk</span>
                  <span className={cn('tabular-nums font-bold', isVetoed ? 'text-bear' : 'text-fg')}>
                    {simulationStage === 'idle' ? '--' : isVetoed ? 'VETO' : `${scenario.riskScore}%`}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <m.div
                    className={cn('h-full rounded-full transition-colors duration-300', isVetoed ? 'bg-bear' : 'bg-warn')}
                    initial={{ width: 0 }}
                    animate={{ width: simulationStage !== 'idle' ? (isVetoed ? '100%' : `${scenario.riskScore}%`) : '0%' }}
                    transition={{ duration: 0.7, ease: 'easeOut', delay: 0.2 }}
                  />
                </div>
                <p className="mt-2 font-sans text-[11px] text-fg-muted truncate">
                  {isVetoed ? 'Risk Limit Exceeded (>1.0%)' : 'Within 1.0% Risk Guardrail'}
                </p>
              </div>

              {/* Desk 4: Sentiment */}
              <div className="surface-chip rounded-xl p-4 border border-white/10 bg-[#161718]">
                <div className="flex items-center justify-between font-mono text-xs mb-2">
                  <span className="text-brand font-bold uppercase">Whales</span>
                  <span className="text-fg tabular-nums font-bold">
                    {simulationStage === 'idle' ? '--' : `${scenario.sentimentScore}%`}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <m.div
                    className="h-full bg-brand rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: simulationStage !== 'idle' ? `${scenario.sentimentScore}%` : '0%' }}
                    transition={{ duration: 0.85, ease: 'easeOut', delay: 0.15 }}
                  />
                </div>
                <p className="mt-2 font-sans text-[11px] text-fg-muted truncate">
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
                className="mt-5 p-3 rounded-xl border border-white/5 bg-black/40"
              >
                <div className="flex items-center justify-between text-[11px] font-mono mb-2">
                  <span className="text-bull font-semibold flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-bull" />
                    BULLISH PROBABILITY {scenario.bullProbability}%
                  </span>
                  <span className="text-fg-subtle">
                    COMMITTEE BIAS BALANCE
                  </span>
                  <span className="text-bear font-semibold flex items-center gap-1.5">
                    BEARISH PROBABILITY {100 - scenario.bullProbability}%
                    <span className="size-1.5 rounded-full bg-bear" />
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden flex">
                  <m.div
                    className="h-full bg-bull"
                    initial={{ width: '50%' }}
                    animate={{ width: `${scenario.bullProbability}%` }}
                    transition={{ duration: 0.9, ease: 'easeOut' }}
                  />
                  <m.div
                    className="h-full bg-bear"
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
              'rounded-xl surface-well p-4 sm:p-5 border transition-all duration-300 my-6',
              isVetoed
                ? 'border-bear/50 bg-bear/[0.05] shadow-[0_0_20px_rgba(224,44,16,0.15)]'
                : 'border-white/10 bg-[#090a0b]',
            )}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div>
                <span className="font-mono text-xs font-bold text-fg uppercase tracking-wider flex items-center gap-2">
                  <IconLock className="size-3.5 text-brand" />
                  PORTFOLIO RISK GUARDRAIL (1.0% MAX LOSS)
                </span>
                <span className="block font-sans text-xs text-fg-muted mt-0.5">
                  Drag the slider above 1.0% to see how Kestrel blocks oversized risk before you place a trade.
                </span>
              </div>
              <div className="font-mono text-xs font-bold shrink-0">
                RISK PER TRADE:{' '}
                <span className={cn('tabular-nums font-mono font-black', isVetoed ? 'text-bear' : 'text-bull')}>
                  {riskSlider.toFixed(1)}%
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <span className="font-mono text-xs text-fg-subtle">0.5%</span>
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
                className="w-full accent-brand cursor-pointer"
              />
              <span className="font-mono text-xs text-fg-subtle">2.5%</span>
            </div>

            {isVetoed && (
              <m.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-3.5 flex items-center justify-between flex-wrap gap-2 rounded-lg bg-bear/15 border border-bear/40 p-3 text-xs font-mono text-bear"
              >
                <div className="flex items-center gap-2">
                  <IconAlertTriangle className="size-4 shrink-0 animate-bounce" />
                  <span>
                    <strong>RISK GUARDRAIL TRIGGERED:</strong> {riskSlider.toFixed(1)}% risk exceeds your 1.0% maximum drawdown rule. Trade plan paused.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setRiskSlider(1.0)}
                  className="px-2.5 py-1 rounded bg-bear/20 hover:bg-bear/30 border border-bear/40 text-[11px] font-bold underline transition-colors cursor-pointer"
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
                className="rounded-xl border border-bear/50 bg-bear/[0.04] p-5 sm:p-6 shadow-xl"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-bear/20 pb-4">
                  <div className="flex items-center gap-3">
                    <span className="size-3 rounded-full bg-bear animate-ping" />
                    <div>
                      <div className="font-mono text-sm font-bold text-bear uppercase tracking-wider">
                        SETUP BLOCKED BY RISK GUARDRAIL
                      </div>
                      <div className="font-mono text-[11px] text-fg-subtle">
                        REASON: PROPOSED {riskSlider.toFixed(1)}% RISK EXCEEDS YOUR 1.0% MAXIMUM RISK PER TRADE
                      </div>
                    </div>
                  </div>
                  <span className="font-mono text-xs font-bold px-3 py-1 rounded-full uppercase border text-center text-bear bg-bear/10 border-bear/30">
                    RISK VETO ACTIVE
                  </span>
                </div>

                <div className="mt-4 p-4 rounded-lg surface-well bg-black/60 border border-bear/20 font-sans text-xs text-fg-muted leading-relaxed">
                  Kestrel&apos;s Risk Desk protects your account from emotional over-sizing. Lower the risk slider back to ≤ 1.0% to unlock the verified trade plan and target levels.
                </div>

                <div className="mt-4 flex items-center justify-between pt-2">
                  <span className="font-mono text-[11px] text-fg-subtle">
                    DRAWDOWN PROTECTION ACTIVE · CAPITAL PRESERVED
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setRiskSlider(1.0)}
                    className="font-mono text-xs text-bull border-bull/30 hover:bg-bull/10"
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
                className="rounded-xl border border-brand/40 bg-brand/[0.03] p-5 sm:p-6 shadow-xl"
              >
                {/* Certified Trade Plan Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
                  <div className="flex items-center gap-3">
                    <span className="size-3 rounded-full bg-bull shadow-[0_0_8px_#3f9e3d]" />
                    <div>
                      <div className="font-mono text-sm font-bold text-fg uppercase flex items-center gap-2">
                        <span>VERIFIED COMMITTEE TRADE PLAN · {scenario.symbol}</span>
                        <span className="text-[10px] text-brand bg-brand/10 border border-brand/20 px-2 py-0.5 rounded font-mono">
                          {scenario.orderType}
                        </span>
                      </div>
                      <div className="font-mono text-[11px] text-fg-subtle flex items-center gap-2 mt-0.5">
                        <span>PLAN ID: {scenario.txHash}</span>
                        <button
                          type="button"
                          onClick={() => handleCopyHash(scenario.journalSummary)}
                          className="hover:text-fg transition-colors"
                          title="Copy Trade Setup"
                        >
                          {copiedHash ? <IconCheck className="size-3 text-bull inline" /> : <IconCopy className="size-3 inline" />}
                        </button>
                        <span>· STATUS: 4-DESK CONSENSUS VERIFIED</span>
                      </div>
                    </div>
                  </div>

                  <span
                    className={cn(
                      'font-mono text-xs font-bold px-3 py-1 rounded-full uppercase border text-center shrink-0',
                      scenario.action.startsWith('BUY')
                        ? 'text-bull bg-bull/10 border-bull/30 shadow-[0_0_12px_rgba(63,158,61,0.2)]'
                        : 'text-bear bg-bear/10 border-bear/30 shadow-[0_0_12px_rgba(224,44,16,0.2)]',
                    )}
                  >
                    {scenario.action}
                  </span>
                </div>

                {/* Quantitative Levels Grid */}
                <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center font-mono">
                  <div className="rounded-lg surface-well p-3.5 bg-black/60 border border-white/5">
                    <span className="text-[10px] text-fg-subtle block uppercase">ENTRY ZONE</span>
                    <span className="text-base font-bold text-fg tabular-nums">{scenario.entry}</span>
                  </div>
                  <div className="rounded-lg surface-well p-3.5 bg-black/60 border border-bear/20">
                    <span className="text-[10px] text-bear block uppercase">INVALIDATION (SL)</span>
                    <span className="text-base font-bold text-bear tabular-nums">{scenario.invalidation}</span>
                  </div>
                  <div className="rounded-lg surface-well p-3.5 bg-black/60 border border-white/5">
                    <span className="text-[10px] text-bull block uppercase">TP1 (40% SCALE)</span>
                    <span className="text-base font-bold text-bull tabular-nums">{scenario.target1}</span>
                  </div>
                  <div className="rounded-lg surface-well p-3.5 bg-black/60 border border-white/5">
                    <span className="text-[10px] text-bull block uppercase">TP2 RUNNER ({scenario.rr})</span>
                    <span className="text-base font-bold text-bull tabular-nums">{scenario.target2}</span>
                  </div>
                </div>

                {/* Take Profit Cones Visual Breakdown */}
                <div className="mt-5 p-4 rounded-xl border border-white/5 bg-[#0e0f10]">
                  <div className="flex items-center justify-between text-xs font-mono mb-3">
                    <span className="text-fg-subtle uppercase">TAKE-PROFIT SCALING PLAN</span>
                    <span className="text-fg font-bold">EXPECTED VALUE: {scenario.expectedValue} · RECOMMENDED RISK: {scenario.kellySize}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-xs font-mono">
                    <div className="border border-white/10 rounded-lg p-2.5 bg-black/40">
                      <div className="text-[10px] text-fg-subtle">TARGET 1 (1:1.5)</div>
                      <div className="text-bull font-bold mt-1">{scenario.target1}</div>
                      <div className="text-[10px] text-fg-muted mt-0.5">Scale Out 40%</div>
                    </div>
                    <div className="border border-white/10 rounded-lg p-2.5 bg-black/40">
                      <div className="text-[10px] text-fg-subtle">TARGET 2 (1:2.5)</div>
                      <div className="text-bull font-bold mt-1">{scenario.target2}</div>
                      <div className="text-[10px] text-fg-muted mt-0.5">Scale Out 35%</div>
                    </div>
                    <div className="border border-brand/30 rounded-lg p-2.5 bg-brand/[0.04]">
                      <div className="text-[10px] text-brand font-bold">TARGET 3 RUNNER (1:4.0)</div>
                      <div className="text-bull font-bold mt-1">{scenario.target3}</div>
                      <div className="text-[10px] text-fg-muted mt-0.5">Trail Remaining 25%</div>
                    </div>
                  </div>
                </div>

                {/* Committee Verdict Rationale & Action Dispatch */}
                <div className="mt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-white/10">
                  <div className="flex flex-col gap-1.5 max-w-xl">
                    <p className="font-sans text-xs text-fg-muted leading-relaxed">
                      &ldquo;{scenario.arbiterVerdict}&rdquo;
                    </p>
                    <span className="font-mono text-[10px] text-fg-subtle">
                      Direct Broker Bridge (MT5 / cTrader) — Planned on Roadmap
                    </span>
                  </div>

                  <Button
                    variant="tactical"
                    size="md"
                    onClick={handleDispatchBridge}
                    className="font-mono text-xs font-semibold gap-2 shrink-0 shadow-md"
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
                className="rounded-xl border border-brand/40 bg-black/80 p-6 shadow-2xl"
              >
                <div className="flex items-center gap-3 font-mono text-xs text-brand mb-4">
                  <IconTerminal2 className="size-4 animate-spin" />
                  <span>LOGGING SETUP TO TRADE JOURNAL & ARMING PRICE ALERTS...</span>
                </div>
                <div className="surface-well rounded-lg p-4 font-mono text-[11px] text-bull/90 overflow-x-auto bg-[#08090a] border border-white/10">
                  <code>{scenario.journalSummary}</code>
                </div>
                <div className="mt-3 flex items-center justify-between text-[11px] font-mono text-fg-subtle">
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
                className="rounded-xl border border-bull/40 bg-bull/[0.05] p-6 text-center shadow-xl"
              >
                <div className="flex size-12 items-center justify-center rounded-full bg-bull/20 border border-bull/40 text-bull mx-auto mb-3 shadow-[0_0_16px_rgba(63,158,61,0.25)]">
                  <IconCheck className="size-6" />
                </div>
                <h4 className="font-display text-xl font-normal tracking-tight text-fg">
                  SETUP LOGGED TO JOURNAL & PRICE ALERTS ARMED
                </h4>
                <p className="font-mono text-xs text-fg-muted mt-2 max-w-lg mx-auto leading-relaxed">
                  Plan {scenario.txHash} has been saved to your Trade Journal with R-multiple targets and instant Telegram, Browser Push, and Email alerts armed at Entry ({scenario.entry}), Invalidation ({scenario.invalidation}), and TP1 ({scenario.target1}).
                </p>

                <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleCopyHash(scenario.journalSummary)}
                    className="font-mono text-xs gap-1.5 border-white/10"
                  >
                    {copiedHash ? <IconCheck className="size-3.5 text-bull" /> : <IconCopy className="size-3.5" />}
                    <span>{copiedHash ? 'Setup Copied!' : 'Copy Trade Plan Summary'}</span>
                  </Button>
                  <Button variant="secondary" size="sm" onClick={handleReset} className="font-mono text-xs border-white/10">
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
