'use client';

// SPDX-License-Identifier: Apache-2.0

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

// Interactive committee-simulator shell. Scenario data lives in `scenarios.ts`
// and each console section is its own component; this file owns the state
// machine shared between them.
import { IconPlayerPlay, IconRefresh } from '@tabler/icons-react';
import { AnimatePresence, m } from 'motion/react';
import Image from 'next/image';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/formatters/cn';

import { SCENARIOS, type SimulationStage } from './scenarios';
import { SimulatorCanvas } from './simulator-canvas';
import { SimulatorControls } from './simulator-controls';
import { DispatchedCard, DispatchingCard } from './simulator-dispatch';
import { VerifiedPlanCard, VetoedVerdictCard } from './simulator-verdict';

export function LandingSimulator() {
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('london-sweep');
  const [simulationStage, setSimulationStage] = useState<SimulationStage>('idle');
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

  const handleRestoreLimit = () => setRiskSlider(1.0);

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

          <SimulatorCanvas
            scenario={scenario}
            simulationStage={simulationStage}
            isVetoed={isVetoed}
          />

          <SimulatorControls
            riskSlider={riskSlider}
            isVetoed={isVetoed}
            onRiskChange={setRiskSlider}
            onRestoreLimit={handleRestoreLimit}
          />

          {/* Verdict and Trade Plan Ticket */}
          <AnimatePresence mode="wait">
            {simulationStage === 'verdict' && isVetoed && (
              <VetoedVerdictCard riskSlider={riskSlider} onRestoreLimit={handleRestoreLimit} />
            )}

            {simulationStage === 'verdict' && !isVetoed && (
              <VerifiedPlanCard
                scenario={scenario}
                copiedHash={copiedHash}
                onCopyHash={handleCopyHash}
                onDispatchBridge={handleDispatchBridge}
              />
            )}

            {simulationStage === 'dispatching' && <DispatchingCard scenario={scenario} />}

            {simulationStage === 'dispatched' && (
              <DispatchedCard
                scenario={scenario}
                copiedHash={copiedHash}
                onCopyHash={handleCopyHash}
                onReset={handleReset}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
