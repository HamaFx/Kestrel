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

// Interactive trade-ticket & risk-blocker simulator shell. Starts live on load
// so visitors immediately see the full 4-pillar breakdown, chart bands, and
// 5-level trade ticket without dead placeholder states.
import { IconRefresh } from '@tabler/icons-react';
import { AnimatePresence, m } from 'motion/react';
import { useState } from 'react';

import { BlueprintPlate } from '@/components/brand/blueprint-plates';
import { Button } from '@/components/ui/button';
import { useCopied } from '@/hooks/use-copied';
import { cn } from '@/lib/formatters/cn';

import { SCENARIOS, type SimulationStage } from './scenarios';
import { SimulatorCanvas } from './simulator-canvas';
import { SimulatorControls } from './simulator-controls';
import { VerifiedPlanCard, VetoedVerdictCard } from './simulator-verdict';

export function LandingSimulator() {
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('london-sweep');
  const [simulationStage, setSimulationStage] = useState<SimulationStage>('verdict');
  const [riskSlider, setRiskSlider] = useState<number>(1.0);
  const [armedScenarioIds, setArmedScenarioIds] = useState<Record<string, boolean>>({});
  const [copiedHash, markCopiedHash] = useCopied(2000);

  const scenario = SCENARIOS.find((s) => s.id === selectedScenarioId) ?? SCENARIOS[0]!;
  const isVetoed = riskSlider > 1.0;
  const isArmed = Boolean(armedScenarioIds[scenario.id]);

  const triggerPulseScan = (nextScenarioId?: string) => {
    if (nextScenarioId) {
      setSelectedScenarioId(nextScenarioId);
    }
    setSimulationStage('voting');
    setTimeout(() => {
      setSimulationStage('verdict');
    }, 320);
  };

  const handleCopyHash = (text: string) => {
    void navigator.clipboard?.writeText(text);
    markCopiedHash();
  };

  const handleToggleArm = () => {
    setArmedScenarioIds((prev) => ({
      ...prev,
      [scenario.id]: !prev[scenario.id],
    }));
  };

  const handleRestoreLimit = () => setRiskSlider(1.0);

  return (
    <section
      id="simulator"
      className="relative overflow-hidden border-t border-white/5 bg-[#0d0e0f] py-28 lg:py-36"
    >
      {/* ── Astrolabe Celestial Calculation Engine Backdrop ── */}
      <div
        aria-hidden="true"
        className="simulator-backdrop-mask pointer-events-none absolute top-4 right-0 z-0 h-[260px] w-[72%] opacity-18 mix-blend-screen select-none sm:top-8 sm:h-[360px] sm:w-[60%] lg:top-8 lg:right-2 lg:h-[540px] lg:w-[42%] lg:opacity-28"
      >
        <BlueprintPlate
          id="astrolabe"
          showRasterBackup
          variant="watermark"
          className="h-full w-full"
        />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto mb-12 flex max-w-3xl flex-col items-center gap-4 text-center">
          <div className="border-brand/30 bg-brand/10 inline-flex items-center gap-2 rounded-full border px-3.5 py-1 font-mono text-xs">
            <span className="bg-brand size-2 rounded-full" />
            <span className="text-brand font-semibold tracking-wider uppercase">
              Live Trade Plan & Risk Sandbox
            </span>
          </div>

          <h2 className="font-display text-fg text-3xl font-normal tracking-[-0.03em] sm:text-5xl">
            TEST-DRIVE A VERIFIED{' '}
            <span className="font-redaction-35 text-brand italic">Trade Ticket</span>
          </h2>
          <p className="text-fg-muted font-sans text-base leading-relaxed">
            Switch between real market setups or push the risk slider above 1.0% to see how Kestrel
            calculates your entry, 3 take-profit targets, and hard account protection in real time.
          </p>
        </div>

        {/* Scenario Pill Selector */}
        <div
          role="tablist"
          aria-label="Market scenarios"
          className="mb-8 flex flex-wrap items-center justify-center gap-2"
        >
          {SCENARIOS.map((sc) => {
            const isSelected = sc.id === selectedScenarioId;
            return (
              <button
                key={sc.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => triggerPulseScan(sc.id)}
                className={cn(
                  'relative cursor-pointer rounded-xl border px-4 py-2.5 font-mono text-xs font-semibold transition-all duration-200 active:translate-y-[0.5px]',
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
                <span className="text-fg-subtle ml-2 text-[10px]">· {sc.tag}</span>
              </button>
            );
          })}
        </div>

        {/* Main Interactive Simulator Console */}
        <div className="surface-panel relative overflow-hidden rounded-2xl border border-white/15 bg-[#121314]/95 p-6 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.12)] sm:p-8">
          {/* Top Bar: Event Catalyst & Re-Scan Trigger */}
          <div className="flex flex-col justify-between gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-center">
            <div className="flex max-w-2xl flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-brand font-mono text-[11px] font-bold tracking-wider uppercase">
                  LIVE SETUP · {scenario.name}
                </span>
                <span className="text-fg-subtle rounded border border-white/10 bg-black/40 px-1.5 py-0.5 font-mono text-[10px]">
                  {scenario.orderType}
                </span>
              </div>
              <span className="text-fg font-sans text-sm font-medium">{scenario.catalyst}</span>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => triggerPulseScan()}
                className="gap-2 border-white/15 font-mono text-xs hover:bg-white/5"
              >
                <IconRefresh className="size-3.5" />
                Re-Scan Setup
              </Button>
            </div>
          </div>

          <SimulatorControls
            riskSlider={riskSlider}
            isVetoed={isVetoed}
            onRiskChange={setRiskSlider}
            onRestoreLimit={handleRestoreLimit}
          />

          <SimulatorCanvas
            scenario={scenario}
            simulationStage={simulationStage}
            isVetoed={isVetoed}
          />

          {/* Verdict and Trade Plan Ticket */}
          <AnimatePresence mode="wait">
            {isVetoed ? (
              <VetoedVerdictCard riskSlider={riskSlider} onRestoreLimit={handleRestoreLimit} />
            ) : (
              <VerifiedPlanCard
                scenario={scenario}
                copiedHash={copiedHash}
                isArmed={isArmed}
                onCopyHash={handleCopyHash}
                onToggleArm={handleToggleArm}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
