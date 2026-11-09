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

// Landing stepper section shell: owns the auto-advance state machine and
// composes the 3-step research workflow preview (1. Pick a Market ->
// 2. Ask or Run Deep Analysis -> 3. Review Levels & Risk Plan).
import { IconPlayerPause, IconPlayerPlay } from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { BriefingPanel } from './briefing-panel';
import { CircuitSpine, nodeYCoordinates } from './circuit-spine';
import { StageCards } from './stage-cards';
import { STAGE_INTERVAL_MS, STEPS, type Step } from './steps';

export function LandingStepper() {
  const [activeStep, setActiveStep] = useState<number>(1);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [progress, setProgress] = useState<number>(0);
  const progressTimerRef = useRef<NodeJS.Timeout | null>(null);

  const nextStep = useCallback(() => {
    setActiveStep((prev) => (prev % STEPS.length) + 1);
    setProgress(0);
  }, []);

  // Auto-advancing stage runner
  useEffect(() => {
    if (!isPlaying) {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      return;
    }

    const intervalMs = 50;
    const increment = (intervalMs / STAGE_INTERVAL_MS) * 100;

    progressTimerRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          nextStep();
          return 0;
        }
        return prev + increment;
      });
    }, intervalMs);

    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    };
  }, [isPlaying, nextStep]);

  const handleSelectStep = (id: number) => {
    setActiveStep(id);
    setProgress(0);
  };

  const current: Step = STEPS.find((s) => s.id === activeStep) ?? STEPS[0]!;

  const activeY = nodeYCoordinates[activeStep - 1] ?? 65;
  const progressRatio = (activeStep - 1) / Math.max(1, STEPS.length - 1);

  return (
    <section
      id="stepper"
      className="relative overflow-hidden border-t border-b border-white/5 bg-[#0c0d0e] py-28 lg:py-36"
    >
      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mb-16 flex max-w-3xl flex-col items-start gap-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-xs">
            <span className="bg-brand size-2 rounded-full shadow-[0_0_8px_#ff3616]" />
            <span className="text-brand font-semibold tracking-wider uppercase">
              3-Step Research Workflow
            </span>
          </div>

          <h2 className="font-display text-fg text-3xl font-normal tracking-[-0.03em] sm:text-5xl">
            HOW KESTREL BUILDS{' '}
            <span className="font-redaction-35 text-brand italic">Your Trade Plan</span>
          </h2>
          <p className="text-fg-muted font-sans text-base leading-relaxed">
            Go from selecting a market to reviewing a complete, risk-checked trade plan in three
            clear steps: 1. Pick a Market → 2. Ask or Run Deep Analysis → 3. Review Levels &amp;
            Risk Plan.
          </p>

          {/* Autoplay & Workflow Status Pill */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsPlaying(!isPlaying)}
              className="text-fg-subtle hover:text-fg inline-flex items-center gap-2 rounded-lg border border-white/10 bg-[#161718] px-3 py-1.5 font-mono text-xs transition-colors hover:border-white/20 active:translate-y-[0.5px]"
            >
              {isPlaying ? (
                <>
                  <IconPlayerPause className="text-brand size-3.5" />
                  <span>Auto-Advancing Walkthrough (Active)</span>
                </>
              ) : (
                <>
                  <IconPlayerPlay className="text-bull size-3.5" />
                  <span>Resume Walkthrough</span>
                </>
              )}
            </button>
            <span className="text-fg-subtle font-mono text-xs">
              WORKFLOW: <strong className="text-bull">3 SIMPLE STEPS</strong>
            </span>
          </div>
        </div>

        {/* Pipeline Layout: Left Circuit Trace + Stages; Right Dynamic Panel */}
        <div className="grid gap-8 lg:grid-cols-12 lg:items-start">
          {/* Left Column: Continuous Circuit SVG + Step Cards */}
          <div
            role="tablist"
            aria-label="Workflow steps"
            className="relative flex flex-col gap-4 pl-10 sm:pl-14 lg:col-span-6"
          >
            <CircuitSpine activeStep={activeStep} activeY={activeY} progressRatio={progressRatio} />
            <StageCards
              activeStep={activeStep}
              progress={progress}
              isPlaying={isPlaying}
              onSelectStep={handleSelectStep}
            />
          </div>

          <BriefingPanel current={current} />
        </div>
      </div>
    </section>
  );
}
