'use client';

// SPDX-License-Identifier: Apache-2.0

// The 4 interactive stage card buttons of the landing stepper pipeline, with
// the gliding active pill, pass-state badges and countdown progress strip.
import { IconCircleCheck } from '@tabler/icons-react';
import { m } from 'motion/react';

import { cn } from '@/lib/formatters/cn';

import { STEPS } from './steps';

interface StageCardsProps {
  activeStep: number;
  progress: number;
  isPlaying: boolean;
  onSelectStep: (id: number) => void;
}

export function StageCards({ activeStep, progress, isPlaying, onSelectStep }: StageCardsProps) {
  return (
    <>
      {STEPS.map((step) => {
        const active = step.id === activeStep;
        const passed = step.id < activeStep;
        return (
          <button
            key={step.id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls="pipeline-detail-panel"
            onClick={() => onSelectStep(step.id)}
            className={cn(
              'group relative z-10 flex cursor-pointer items-start gap-4 rounded-xl border p-4 text-left transition-all duration-200 active:translate-y-[0.5px] sm:p-5',
              active
                ? 'surface-chip border-brand/50 bg-[#171819] shadow-[var(--shadow-chip)]'
                : 'border-white/5 bg-[#101112]/90 backdrop-blur-sm hover:border-white/10 hover:bg-white/[0.04]',
            )}
          >
            {/* Fluid Gliding Background Pill */}
            {active && (
              <m.div
                layoutId="stepper-tab-active-pill"
                className="border-brand/40 bg-brand/[0.04] absolute inset-0 -z-10 rounded-xl border"
                transition={{ type: 'spring', stiffness: 450, damping: 32 }}
              />
            )}

            {/* Step Number Badge in Redaction Font */}
            <div
              className={cn(
                'relative z-10 flex size-10 shrink-0 items-center justify-center rounded-lg font-mono text-sm font-bold transition-all',
                active
                  ? 'bg-brand border-brand border text-white shadow-[0_0_18px_rgba(255,54,22,0.8)]'
                  : passed
                    ? 'border-bull/30 text-bull border bg-[#121b14]'
                    : 'text-fg-subtle group-hover:text-fg border border-white/10 bg-[#0d0e0f] group-hover:border-white/20',
              )}
            >
              {passed ? <IconCircleCheck className="size-5" /> : step.label}
            </div>

            <div className="flex w-full min-w-0 flex-col gap-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-brand font-mono text-[11px] font-semibold tracking-wider uppercase">
                    {step.tag}
                  </span>
                  <span className="text-fg-subtle font-mono text-[10px]">· {step.latency}</span>
                </div>
                {active && isPlaying && (
                  <span className="text-brand animate-pulse font-mono text-[10px] font-bold uppercase">
                    ACTIVE
                  </span>
                )}
              </div>

              <h3 className="font-display text-fg text-lg font-normal tracking-tight group-hover:text-white">
                {step.title}
              </h3>
              <p className="text-fg-muted font-sans text-xs leading-relaxed">{step.description}</p>

              {/* Active Step Progress Countdown Strip */}
              {active && isPlaying && (
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="bg-brand h-full transition-all duration-75 ease-linear"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
            </div>
          </button>
        );
      })}
    </>
  );
}
