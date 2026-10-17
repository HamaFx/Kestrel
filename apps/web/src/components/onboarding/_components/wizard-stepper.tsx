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

import { IconCheck } from '@tabler/icons-react';

interface WizardStepperProps {
  step: number;
}

const STEP_LABELS = ['Profile', 'Trading Style', 'Watchlist', 'Review'] as const;

export function WizardStepper({ step }: WizardStepperProps) {
  const currentLabel = STEP_LABELS[step - 1] ?? STEP_LABELS[0];

  return (
    <div
      className="mb-6 flex flex-col gap-2"
      role="group"
      aria-label={`Setup progress: step ${step} of ${STEP_LABELS.length}, ${currentLabel}`}
    >
      <div className="flex items-center justify-between" role="list" aria-label="Setup steps">
        {[1, 2, 3, 4].map((i) => {
          const isCurrent = step === i;
          const isCompleted = step > i;
          return (
            <div
              key={i}
              className="flex items-center gap-2"
              role="listitem"
              aria-current={isCurrent ? 'step' : undefined}
              aria-label={`Step ${i}: ${STEP_LABELS[i - 1]}`}
            >
              <div className="flex items-center gap-2">
                <div
                  aria-hidden="true"
                  className={`flex size-8 items-center justify-center rounded-lg text-sm font-semibold transition-colors ${
                    isCurrent
                      ? 'bg-brand text-white shadow-[0_0_12px_rgba(255,54,22,0.4)]'
                      : isCompleted
                        ? 'bg-fg text-black'
                        : 'bg-bg-elev-2 text-fg-subtle border border-white/10'
                  }`}
                >
                  {isCompleted ? <IconCheck className="size-4" /> : i}
                </div>
                <span
                  className={`hidden sm:inline text-xs font-medium ${
                    isCurrent ? 'text-fg font-semibold' : isCompleted ? 'text-fg-muted' : 'text-fg-subtle'
                  }`}
                >
                  {STEP_LABELS[i - 1]}
                </span>
              </div>
              {i < 4 && (
                <div
                  className={`h-px w-6 transition-colors sm:w-10 ${
                    isCompleted ? 'bg-fg' : 'bg-bg-elev-2'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
      <p className="text-fg-muted text-caption sm:hidden" aria-live="polite">
        Step {step} of {STEP_LABELS.length} · <span className="text-fg">{currentLabel}</span>
      </p>
    </div>
  );
}
