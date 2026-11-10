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

// 3-Stage Workflow section (#stepper). Combines the left circuit spine + stage
// cards with the right spacious preview surface.
import { useEffect, useState } from 'react';

import { BlueprintPlate } from '@/components/brand/blueprint-plates';

import { BriefingPanel } from './briefing-panel';
import { CircuitSpine, nodeYCoordinates } from './circuit-spine';
import { StageCards } from './stage-cards';
import { STEPS } from './steps';

export function LandingStepper() {
  const [activeStep, setActiveStep] = useState<number>(1);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [progress, setProgress] = useState<number>(0);

  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          setActiveStep((s) => (s >= STEPS.length ? 1 : s + 1));
          return 0;
        }
        return prev + 2;
      });
    }, 110);

    return () => clearInterval(interval);
  }, [isPlaying]);

  const handleStepSelect = (id: number) => {
    setActiveStep(id);
    setProgress(0);
    setIsPlaying(false);
  };

  const currentStep = STEPS.find((s) => s.id === activeStep) ?? STEPS[0]!;
  const activeY = nodeYCoordinates[activeStep - 1] ?? 65;
  const progressRatio = (activeY - 20) / 360;

  return (
    <section
      id="stepper"
      className="relative overflow-hidden border-b border-white/[0.08] bg-[#121212] py-28 lg:py-36"
    >
      {/* Chiaroscuro colonnade sculpture backdrop */}
      <div
        aria-hidden="true"
        className="stepper-backdrop-mask pointer-events-none absolute top-6 left-0 z-0 h-[320px] w-[88%] opacity-35 mix-blend-screen select-none sm:h-[420px] sm:w-[72%] lg:top-0 lg:left-0 lg:h-[84%] lg:w-[48%] lg:opacity-45"
      >
        <BlueprintPlate id="colonnade" variant="backdrop" className="h-full w-full" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Spacious Section Header */}
        <div className="mb-16 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <div className="text-brand mb-3 font-mono text-xs font-semibold tracking-[0.14em] uppercase">
              02 · EXECUTION WORKFLOW
            </div>
            <h2 className="font-display text-fg text-3xl font-normal tracking-[-0.02em] sm:text-5xl">
              From Market Feed to{' '}
              <span className="font-redaction-35 text-brand italic">Verified Bracket.</span>
            </h2>
          </div>
          <p className="text-fg-muted max-w-md font-sans text-base leading-relaxed">
            Three deterministic stages transform raw multi-provider market feeds into a risk-capped
            trade plan and live price alerts.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-stretch lg:gap-12">
          {/* Left Column: Continuous SVG Circuit Spine & 3 Stage Cards */}
          <div
            className="relative flex flex-col justify-between gap-4 pl-8 sm:pl-10 lg:col-span-5"
            role="tablist"
            aria-label="Research workflow stages"
          >
            <CircuitSpine
              activeStep={activeStep}
              activeY={activeY}
              progressRatio={progressRatio}
            />
            <StageCards
              activeStep={activeStep}
              progress={progress}
              isPlaying={isPlaying}
              onSelectStep={handleStepSelect}
            />
          </div>

          {/* Right Column: Spacious Stage Preview Surface */}
          <BriefingPanel
            currentStep={currentStep}
            isPlaying={isPlaying}
            onTogglePlay={() => setIsPlaying((p) => !p)}
            onSelectStep={handleStepSelect}
          />
        </div>
      </div>
    </section>
  );
}
