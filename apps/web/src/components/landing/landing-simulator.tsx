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
import {
  IconPlayerPlay,
  IconCheck,
  IconAlertTriangle,
  IconSend,
  IconRefresh,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

interface Scenario {
  id: string;
  name: string;
  symbol: string;
  catalyst: string;
  action: 'BUY / LONG' | 'SELL / SHORT';
  entry: string;
  invalidation: string;
  target1: string;
  target2: string;
  rr: string;
  techScore: number;
  macroScore: number;
  riskScore: number;
  sentimentScore: number;
  arbiterVerdict: string;
  txHash: string;
}

const SCENARIOS: Scenario[] = [
  {
    id: 'london-sweep',
    name: 'London Fix Liquidity Sweep',
    symbol: 'XAU/USD',
    catalyst: 'Asia low swept into 15m Bullish Fair Value Gap',
    action: 'BUY / LONG',
    entry: '2,864.20',
    invalidation: '2,846.50',
    target1: '2,884.00',
    target2: '2,916.50',
    rr: '1:3.22',
    techScore: 94,
    macroScore: 88,
    riskScore: 92,
    sentimentScore: 86,
    arbiterVerdict: 'Unanimous 4-Desk Consensus. Asymmetric Long Authorized.',
    txHash: '0x8F4A21...7C9B',
  },
  {
    id: 'pce-beat',
    name: 'US Core PCE Inflation Print',
    symbol: 'EUR/USD',
    catalyst: 'Yield curve steepens, Dollar Index rejects 200 EMA',
    action: 'SELL / SHORT',
    entry: '1.0845',
    invalidation: '1.0875',
    target1: '1.0810',
    target2: '1.0760',
    rr: '1:2.83',
    techScore: 91,
    macroScore: 93,
    riskScore: 89,
    sentimentScore: 84,
    arbiterVerdict: 'Macro Rate Divergence Confirmed. Short Executed at Resistance.',
    txHash: '0x3D7C91...1E4F',
  },
  {
    id: 'safe-haven',
    name: 'Geopolitical Flight to Quality',
    symbol: 'XAU/USD',
    catalyst: 'Central Bank bullion accumulation + sovereign debt bid',
    action: 'BUY / LONG',
    entry: '2,870.00',
    invalidation: '2,852.00',
    target1: '2,900.00',
    target2: '2,945.00',
    rr: '1:4.16',
    techScore: 89,
    macroScore: 96,
    riskScore: 90,
    sentimentScore: 94,
    arbiterVerdict: 'Institutional Whale Accumulation. Multi-Week Runner Target.',
    txHash: '0xEE92B4...68A2',
  },
];

export function LandingSimulator() {
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('london-sweep');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationStage, setSimulationStage] = useState<'idle' | 'voting' | 'verdict' | 'dispatched'>('idle');
  const [riskSlider, setRiskSlider] = useState<number>(1.0);

  const scenario = SCENARIOS.find((s) => s.id === selectedScenarioId) ?? SCENARIOS[0]!;
  const isVetoed = riskSlider > 1.0;

  const handleRunDeliberation = () => {
    setIsSimulating(true);
    setSimulationStage('voting');

    setTimeout(() => {
      setSimulationStage('verdict');
      setIsSimulating(false);
    }, 1400);
  };

  const handleDispatchBridge = () => {
    setSimulationStage('dispatched');
  };

  const handleReset = () => {
    setSimulationStage('idle');
  };

  return (
    <section id="simulator" className="relative py-28 lg:py-36 bg-[#0d0e0f] border-t border-white/5 overflow-hidden">
      {/* Background Radial Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-20 left-1/2 -translate-x-1/2 size-[800px] rounded-full bg-brand/10 blur-[150px] select-none"
      />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col items-center text-center gap-4 mb-14 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3.5 py-1 text-xs font-mono shadow-[0_0_12px_rgba(255,54,22,0.2)]">
            <span className="size-2 rounded-full bg-brand animate-pulse" />
            <span className="text-brand font-semibold uppercase tracking-wider">
              Interactive Execution Engine
            </span>
          </div>

          <h2 className="font-display text-3xl font-normal tracking-[-0.03em] text-fg sm:text-5xl">
            TEST THE DELIBERATION{' '}
            <span className="font-redaction-35 italic text-brand">Transaction Loop</span>
          </h2>
          <p className="font-sans text-base text-fg-muted leading-relaxed">
            Select an institutional market event below and trigger the live multi-desk arbitration pipeline. Experience how Kestrel calculates confidence, enforces risk boundaries, and stamps verified trade tickets.
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
                  'relative rounded-xl px-4 py-2.5 font-mono text-xs font-semibold transition-all duration-200 border',
                  isSelected
                    ? 'border-brand/40 bg-brand/10 text-brand shadow-[0_0_16px_rgba(255,54,22,0.15)]'
                    : 'border-white/5 bg-white/[0.02] text-fg-muted hover:border-white/10 hover:text-fg',
                )}
              >
                {isSelected && (
                  <motion.div
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
          {/* Top Bar: Event Catalyst & Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
            <div className="flex flex-col gap-1">
              <span className="font-mono text-[11px] font-bold text-fg-subtle uppercase tracking-wider">
                MARKET CATALYST INGESTION · {scenario.symbol}
              </span>
              <span className="font-sans text-sm font-medium text-fg">
                {scenario.catalyst}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {simulationStage === 'idle' ? (
                <Button
                  variant="tactical"
                  size="md"
                  onClick={handleRunDeliberation}
                  disabled={isSimulating}
                  className="font-mono text-xs font-semibold gap-2 shadow-sm"
                >
                  <IconPlayerPlay className="size-4" />
                  Run Live Deliberation
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="md"
                  onClick={handleReset}
                  className="font-mono text-xs gap-2"
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
                PARALLEL DESK ARBITRATION
              </span>
              <span className="font-mono text-xs text-brand font-semibold">
                {simulationStage === 'voting' ? 'EVALUATING INGESTION (18ms)...' : 'VOTING CONVERGENCE'}
              </span>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Desk 1: Tech */}
              <div className="surface-chip rounded-xl p-4 border border-white/10 bg-[#161718]">
                <div className="flex items-center justify-between font-mono text-xs mb-2">
                  <span className="text-bull font-bold uppercase">Technical</span>
                  <span className="text-fg tabular-nums font-bold">
                    {simulationStage === 'idle' ? '--' : `${scenario.techScore}%`}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <motion.div
                    className="h-full bg-bull rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: simulationStage !== 'idle' ? `${scenario.techScore}%` : '0%' }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                  />
                </div>
                <p className="mt-2 font-sans text-[11px] text-fg-muted truncate">
                  FVG Retest & Asian Low Sweep
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
                  <motion.div
                    className="h-full bg-info rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: simulationStage !== 'idle' ? `${scenario.macroScore}%` : '0%' }}
                    transition={{ duration: 0.9, ease: 'easeOut', delay: 0.1 }}
                  />
                </div>
                <p className="mt-2 font-sans text-[11px] text-fg-muted truncate">
                  Yield Spread & Inflation Print
                </p>
              </div>

              {/* Desk 3: Risk */}
              <div className="surface-chip rounded-xl p-4 border border-white/10 bg-[#161718]">
                <div className="flex items-center justify-between font-mono text-xs mb-2">
                  <span className="text-warn font-bold uppercase">Risk</span>
                  <span className="text-fg tabular-nums font-bold">
                    {simulationStage === 'idle' ? '--' : isVetoed ? 'VETO' : `${scenario.riskScore}%`}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <motion.div
                    className={cn('h-full rounded-full transition-colors', isVetoed ? 'bg-bear' : 'bg-warn')}
                    initial={{ width: 0 }}
                    animate={{ width: simulationStage !== 'idle' ? (isVetoed ? '100%' : `${scenario.riskScore}%`) : '0%' }}
                    transition={{ duration: 0.7, ease: 'easeOut', delay: 0.2 }}
                  />
                </div>
                <p className="mt-2 font-sans text-[11px] text-fg-muted truncate">
                  {isVetoed ? 'Ceiling Exceeded (>1.0%)' : '1.0% Invalidation Satisfied'}
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
                  <motion.div
                    className="h-full bg-brand rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: simulationStage !== 'idle' ? `${scenario.sentimentScore}%` : '0%' }}
                    transition={{ duration: 0.85, ease: 'easeOut', delay: 0.15 }}
                  />
                </div>
                <p className="mt-2 font-sans text-[11px] text-fg-muted truncate">
                  CFTC Commercial Net Positioning
                </p>
              </div>
            </div>
          </div>

          {/* Interactive Risk Tolerance Slider */}
          <div className="rounded-xl surface-well p-4 border border-white/10 bg-[#090a0b] my-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div>
                <span className="font-mono text-xs font-bold text-fg uppercase tracking-wider">
                  INTERACTIVE RISK CEILING SIMULATOR
                </span>
                <span className="block font-sans text-xs text-fg-muted">
                  Drag the slider to test Kestrel&apos;s automatic 1.0% risk veto discipline.
                </span>
              </div>
              <div className="font-mono text-xs font-bold">
                ACCOUNT RISK: <span className={cn(isVetoed ? 'text-bear' : 'text-bull')}>{riskSlider.toFixed(1)}%</span>
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
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-3 flex items-center gap-2 rounded-lg bg-bear/10 border border-bear/30 p-2.5 text-xs font-mono text-bear"
              >
                <IconAlertTriangle className="size-4 shrink-0" />
                <span>
                  <strong>VETO ENFORCED:</strong> Risk ceiling {riskSlider.toFixed(1)}% exceeds the 1.0% institutional drawdown constraint. Trade card generation aborted.
                </span>
              </motion.div>
            )}
          </div>

          {/* Order Plan Ticket Result */}
          <AnimatePresence mode="wait">
            {simulationStage === 'verdict' && isVetoed && (
              <motion.div
                key="verdict-vetoed-card"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.3 }}
                className="rounded-xl border border-bear/40 bg-bear/[0.04] p-5 sm:p-6 shadow-xl"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-bear/20 pb-4">
                  <div className="flex items-center gap-3">
                    <span className="size-3 rounded-full bg-bear shadow-[0_0_8px_#e02c10]" />
                    <div>
                      <div className="font-mono text-sm font-bold text-bear uppercase">
                        TRANSACTION VETOED BY QUANTITATIVE RISK DESK
                      </div>
                      <div className="font-mono text-[11px] text-fg-subtle">
                        REASON: RISK CEILING {riskSlider.toFixed(1)}% EXCEEDS 1.0% MAXIMUM TOLERANCE
                      </div>
                    </div>
                  </div>
                  <span className="font-mono text-xs font-bold px-3 py-1 rounded-full uppercase border text-center text-bear bg-bear/10 border-bear/30">
                    EXECUTION ABORTED
                  </span>
                </div>

                <div className="mt-4 p-4 rounded-lg surface-well bg-black/60 border border-bear/20 font-sans text-xs text-fg-muted leading-relaxed">
                  Kestrel&apos;s mathematical risk governor strictly forbids order ticket emission when account drawdown parameters exceed 1.0%. Lower the risk ceiling slider to ≤ 1.0% to permit algorithmically verified order execution.
                </div>

                <div className="mt-4 flex items-center justify-between pt-2">
                  <span className="font-mono text-[11px] text-fg-subtle">
                    CAPITAL PRESERVATION PROTOCOL ACTIVE
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setRiskSlider(1.0)}
                    className="font-mono text-xs text-bull border-bull/30 hover:bg-bull/10"
                  >
                    Restore 1.0% Floor
                  </Button>
                </div>
              </motion.div>
            )}

            {simulationStage === 'verdict' && !isVetoed && (
              <motion.div
                key="verdict-card"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.3 }}
                className="rounded-xl border border-brand/40 bg-brand/[0.04] p-5 sm:p-6 shadow-xl"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
                  <div className="flex items-center gap-3">
                    <span className="size-3 rounded-full bg-bull shadow-[0_0_8px_#3f9e3d]" />
                    <div>
                      <div className="font-mono text-sm font-bold text-fg uppercase">
                        CERTIFIED TRANSACTION TICKET · {scenario.symbol}
                      </div>
                      <div className="font-mono text-[11px] text-fg-subtle">
                        HASH: {scenario.txHash} · STATUS: VERIFIED ARBITRATION
                      </div>
                    </div>
                  </div>

                  <span
                    className={cn(
                      'font-mono text-xs font-bold px-3 py-1 rounded-full uppercase border text-center',
                      scenario.action.startsWith('BUY')
                        ? 'text-bull bg-bull/10 border-bull/30'
                        : 'text-bear bg-bear/10 border-bear/30',
                    )}
                  >
                    {scenario.action}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center font-mono">
                  <div className="rounded-lg surface-well p-3 bg-black/60 border border-white/5">
                    <span className="text-[10px] text-fg-subtle block">ENTRY ZONE</span>
                    <span className="text-base font-bold text-fg">{scenario.entry}</span>
                  </div>
                  <div className="rounded-lg surface-well p-3 bg-black/60 border border-white/5">
                    <span className="text-[10px] text-bear block">INVALIDATION</span>
                    <span className="text-base font-bold text-bear">{scenario.invalidation}</span>
                  </div>
                  <div className="rounded-lg surface-well p-3 bg-black/60 border border-white/5">
                    <span className="text-[10px] text-bull block">TARGET 1</span>
                    <span className="text-base font-bold text-bull">{scenario.target1}</span>
                  </div>
                  <div className="rounded-lg surface-well p-3 bg-black/60 border border-white/5">
                    <span className="text-[10px] text-bull block">TARGET 2 ({scenario.rr})</span>
                    <span className="text-base font-bold text-bull">{scenario.target2}</span>
                  </div>
                </div>

                <div className="mt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-white/10">
                  <p className="font-sans text-xs text-fg-muted leading-relaxed max-w-xl">
                    &ldquo;{scenario.arbiterVerdict}&rdquo;
                  </p>

                  <Button
                    variant="tactical"
                    size="md"
                    onClick={handleDispatchBridge}
                    className="font-mono text-xs font-semibold gap-2 shrink-0"
                  >
                    <IconSend className="size-4" />
                    Dispatch to FIX Bridge
                  </Button>
                </div>
              </motion.div>
            )}

            {simulationStage === 'dispatched' && (
              <motion.div
                key="dispatched-card"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-xl border border-bull/40 bg-bull/[0.06] p-6 text-center shadow-xl"
              >
                <div className="flex size-12 items-center justify-center rounded-full bg-bull/20 border border-bull/40 text-bull mx-auto mb-3">
                  <IconCheck className="size-6" />
                </div>
                <h4 className="font-display text-xl font-normal tracking-tight text-fg">
                  TRANSACTION DISPATCHED TO BROKER BRIDGE
                </h4>
                <p className="font-mono text-xs text-fg-muted mt-1 max-w-md mx-auto">
                  Ticket #{scenario.txHash} securely dispatched via encrypted webhook to MT5 / cTrader FIX Bridge with 0.0% custodial exposure.
                </p>
                <div className="mt-4">
                  <Button variant="secondary" size="sm" onClick={handleReset} className="font-mono text-xs">
                    Run Another Simulation
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
