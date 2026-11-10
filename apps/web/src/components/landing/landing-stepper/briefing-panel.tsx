'use client';

// SPDX-License-Identifier: Apache-2.0

// Right-column stage preview surface for #stepper: spacious layout, pure
// optical SVG wave/harmonic visualizer (zero flowchart text boxes), concise
// copy, and hairline-divided telemetry columns.
import { IconPlayerPause, IconPlayerPlay } from '@tabler/icons-react';
import { m } from 'motion/react';

import { BlueprintPlate } from '@/components/brand/blueprint-plates';
import { cn } from '@/lib/formatters/cn';

import { STEPS, type Step } from './steps';

interface BriefingPanelProps {
  currentStep: Step;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSelectStep: (id: number) => void;
}

function StageOpticalVisualizer({ stepId }: { stepId: Step['id'] }) {
  // Pure geometric/optical curves with zero <text> or <rect> clutter
  const primaryWave =
    stepId === 1
      ? 'M 0 108 C 80 104, 140 82, 220 76 C 300 70, 380 42, 480 28'
      : stepId === 2
        ? 'M 0 70 C 96 28, 168 112, 240 70 C 312 28, 384 92, 480 44'
        : 'M 0 96 C 110 92, 190 64, 270 64 C 350 64, 400 26, 480 22';

  const secondaryWave =
    stepId === 1
      ? 'M 0 44 C 90 48, 160 66, 240 76 C 320 86, 400 102, 480 112'
      : stepId === 2
        ? 'M 0 110 C 96 92, 168 38, 240 70 C 312 102, 384 48, 480 44'
        : 'M 0 64 L 480 64';

  const focalX = stepId === 1 ? 232 : stepId === 2 ? 240 : 270;
  const focalY = stepId === 1 ? 76 : stepId === 2 ? 70 : 64;

  return (
    <svg
      viewBox="0 0 480 140"
      className="block h-36 w-full select-none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="stage-opt-wash" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,54,22,0.18)" />
          <stop offset="100%" stopColor="rgba(10,11,13,0)" />
        </linearGradient>
        <radialGradient id="stage-focal-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(255,54,22,0.32)" />
          <stop offset="100%" stopColor="rgba(255,54,22,0)" />
        </radialGradient>
      </defs>

      {/* Subtle Structural Hairlines */}
      <line x1="0" y1="35" x2="480" y2="35" stroke="rgba(255,255,255,0.05)" />
      <line x1="0" y1="70" x2="480" y2="70" stroke="rgba(255,255,255,0.08)" strokeDasharray="2 4" />
      <line x1="0" y1="105" x2="480" y2="105" stroke="rgba(255,255,255,0.05)" />
      <line x1={focalX} y1="0" x2={focalX} y2="140" stroke="rgba(255,54,22,0.28)" strokeDasharray="2 3" />

      {/* Gradient Wash */}
      <path d={`${primaryWave} L 480 140 L 0 140 Z`} fill="url(#stage-opt-wash)" />

      {/* Secondary Harmonic Reference Wave */}
      <m.path
        key={`sec-${stepId}`}
        d={secondaryWave}
        fill="none"
        stroke="rgba(255,255,255,0.24)"
        strokeWidth="1.25"
        strokeDasharray="4 4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.45 }}
      />

      {/* Primary Signal Wave */}
      <m.path
        key={`pri-${stepId}`}
        d={primaryWave}
        fill="none"
        stroke="#ff3616"
        strokeWidth="2"
        initial={{ pathLength: 0, opacity: 0.4 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      />

      {/* Focal Convergence Node */}
      <circle cx={focalX} cy={focalY} r="28" fill="url(#stage-focal-halo)" />
      <circle cx={focalX} cy={focalY} r="4.5" fill="#ff3616" stroke="#0a0b0d" strokeWidth="1.5" />
      <circle cx="474" cy={stepId === 1 ? 28 : stepId === 2 ? 44 : 22} r="4" fill="#3f9e3d" />
    </svg>
  );
}

export function BriefingPanel({
  currentStep,
  isPlaying,
  onTogglePlay,
  onSelectStep,
}: BriefingPanelProps) {
  return (
    <div
      id="pipeline-detail-panel"
      role="tabpanel"
      aria-label={currentStep.title}
      className="surface-panel relative flex flex-col justify-between overflow-hidden rounded-2xl border border-white/12 bg-[#141517]/95 p-7 shadow-2xl sm:p-9 lg:col-span-7"
    >
      <BlueprintPlate
        id="colonnade"
        variant="watermark"
        className="pointer-events-none absolute -top-8 -right-8 z-0 size-60 opacity-20"
      />

      {/* Top Bar */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
        <div className="flex items-center gap-2.5">
          <span className="bg-brand size-2 rounded-full shadow-[0_0_8px_#ff3616]" />
          <span className="text-brand font-mono text-xs font-bold tracking-wider uppercase">
            {currentStep.tag}
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="border-bull/30 bg-bull/10 text-bull rounded border px-2.5 py-0.5 font-mono text-[11px] font-bold tracking-wider uppercase">
            {currentStep.statusBadge}
          </span>
          <button
            type="button"
            onClick={onTogglePlay}
            className="text-fg-subtle hover:text-fg flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/40 px-3 py-1 font-mono text-[11px] transition-colors"
            aria-label={isPlaying ? 'Pause workflow cycle' : 'Play workflow cycle'}
          >
            {isPlaying ? (
              <IconPlayerPause className="size-3.5" />
            ) : (
              <IconPlayerPlay className="size-3.5" />
            )}
            <span>{isPlaying ? 'Auto' : 'Paused'}</span>
          </button>
        </div>
      </div>

      {/* Stage Title & Summary */}
      <div className="relative z-10 mt-6">
        <h3 className="font-display text-fg text-2xl font-normal tracking-tight sm:text-3xl">
          {currentStep.title}
        </h3>
        <p className="text-fg-muted mt-2 max-w-xl font-sans text-sm leading-relaxed sm:text-base">
          {currentStep.description}
        </p>
      </div>

      {/* Pure Optical SVG Wave Visualizer */}
      <div className="relative z-10 my-6 overflow-hidden rounded-xl border border-white/[0.07] bg-[#0a0b0d]">
        <StageOpticalVisualizer stepId={currentStep.id} />
      </div>

      {/* Unboxed 3-Column Hairline Spec Footer */}
      <div className="relative z-10">
        <div className="grid grid-cols-1 gap-4 border-t border-white/[0.08] pt-5 font-mono sm:grid-cols-3 sm:divide-x sm:divide-white/[0.08]">
          {currentStep.metrics.map((metric, idx) => (
            <div key={metric.label} className={cn(idx > 0 && 'sm:pl-5')}>
              <span className="text-fg-subtle block text-[10px] tracking-wider uppercase">
                {metric.label}
              </span>
              <span
                className={cn(
                  'mt-1 block text-sm font-bold tabular-nums',
                  metric.tone === 'bull'
                    ? 'text-bull'
                    : metric.tone === 'brand'
                      ? 'text-brand'
                      : 'text-fg',
                )}
              >
                {metric.value}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-white/[0.06] pt-4 font-mono text-[11px]">
          <span className="text-fg-subtle">STAGE 0{currentStep.id} OF 03</span>
          <div className="flex items-center gap-2">
            {STEPS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelectStep(s.id)}
                aria-label={`Select stage ${s.id}`}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  s.id === currentStep.id ? 'bg-brand w-7' : 'w-2 bg-white/20 hover:bg-white/40',
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
