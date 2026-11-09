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

// Landing-page interactive trade setup & 1% risk governor simulator shell.
import { useState } from 'react';

import { BlueprintPlate } from '@/components/brand/blueprint-plates';

import { SCENARIOS, type SimulationStage } from './scenarios';
import { SimulatorCanvas } from './simulator-canvas';
import { SimulatorControls } from './simulator-controls';

export function LandingSimulator() {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [stage, setStage] = useState<SimulationStage>('verdict');
  const [riskPercent, setRiskPercent] = useState<number>(0.85);
  const [copiedHash, setCopiedHash] = useState(false);

  const scenario = SCENARIOS[selectedIdx] ?? SCENARIOS[0]!;
  const isVetoed = riskPercent > 1.0;

  const effectiveScore = isVetoed ? 42 : scenario.consensusScore;
  const effectiveBullProb = isVetoed
    ? scenario.action.startsWith('BUY')
      ? 48
      : 52
    : scenario.bullProbability;

  const handleSelectScenario = (idx: number) => {
    setSelectedIdx(idx);
    setStage('voting');
    setTimeout(() => {
      setStage('verdict');
    }, 600);
  };

  const handleReconvene = () => {
    setStage('voting');
    setTimeout(() => {
      setStage('verdict');
    }, 850);
  };

  const handleDispatch = () => {
    if (isVetoed) return;
    setStage('dispatching');
    setTimeout(() => {
      setStage('dispatched');
    }, 1100);
  };

  const handleCopyHash = (text: string) => {
    void navigator.clipboard?.writeText(text);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 1800);
  };

  return (
    <section
      id="simulator"
      className="relative overflow-hidden border-b border-white/[0.07] bg-[#121212] py-20 lg:py-28"
    >
      {/* Bayer-dithered chiaroscuro astrolabe backdrop */}
      <div
        aria-hidden="true"
        className="section-backdrop-mask-right pointer-events-none absolute top-8 right-0 z-0 h-[260px] w-[85%] opacity-22 mix-blend-screen select-none sm:h-[340px] sm:w-[70%] lg:top-0 lg:right-0 lg:h-[78%] lg:w-[46%] lg:opacity-32"
      >
        <BlueprintPlate id="astrolabe" variant="backdrop" className="h-full w-full" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Concise Section Header */}
        <div className="mb-10 flex flex-col justify-between gap-4 border-b border-white/[0.07] pb-7 lg:flex-row lg:items-end">
          <div>
            <div className="text-brand mb-2.5 flex items-center gap-2 font-mono text-xs tracking-[0.14em] uppercase">
              <span>// 03 · INTERACTIVE SANDBOX</span>
            </div>
            <h2 className="font-display text-fg text-3xl font-normal tracking-[-0.02em] sm:text-5xl">
              Test the 1% Risk Governor{' '}
              <span className="font-redaction-35 text-brand italic">Live.</span>
            </h2>
          </div>
          <p className="text-fg-muted max-w-md font-sans text-sm leading-relaxed sm:text-base">
            Switch scenarios or drag the risk slider past 1.00% equity to watch the Risk Desk veto
            an unsafe trade in real time.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <SimulatorControls
            selectedIdx={selectedIdx}
            riskPercent={riskPercent}
            isVetoed={isVetoed}
            stage={stage}
            onSelectScenario={handleSelectScenario}
            onRiskChange={(next) => {
              setRiskPercent(next);
              if (stage === 'dispatched' || stage === 'dispatching') {
                setStage('verdict');
              }
            }}
            onReconvene={handleReconvene}
          />

          <SimulatorCanvas
            scenario={scenario}
            stage={stage}
            riskPercent={riskPercent}
            isVetoed={isVetoed}
            effectiveScore={effectiveScore}
            effectiveBullProb={effectiveBullProb}
            copiedHash={copiedHash}
            onCopyHash={handleCopyHash}
            onDispatch={handleDispatch}
            onReset={() => setStage('verdict')}
            onRepairRisk={() => setRiskPercent(0.85)}
          />
        </div>
      </div>
    </section>
  );
}
