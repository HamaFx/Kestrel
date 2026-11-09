'use client';

// SPDX-License-Identifier: Apache-2.0

// Clean 3-step workflow preview panel on the right of the landing stepper:
// shows the active step's visual product summary, structured briefing output,
// and live step metrics without fake window chrome dots or decorative plates.
import { IconActivity, IconArrowRight, IconFlame } from '@tabler/icons-react';
import { AnimatePresence, m } from 'motion/react';

import { BlueprintPlate, type BlueprintPlateId } from '@/components/brand/blueprint-plates';
import { cn } from '@/lib/formatters/cn';

import type { Step } from './steps';

interface BriefingPanelProps {
  current: Step;
}

const STEP_PLATE_MAP: Record<number, BlueprintPlateId> = {
  1: 'horus',
  2: 'sentinel',
  3: 'arbiter',
};

const TONE_CLASSES = {
  bull: 'text-bull border-bull/25 bg-bull/10',
  bear: 'text-bear border-bear/25 bg-bear/10',
  brand: 'text-brand border-brand/25 bg-brand/10',
  neutral: 'text-fg border-white/10 bg-white/5',
} as const;

export function BriefingPanel({ current }: BriefingPanelProps) {
  return (
    <div id="pipeline-detail-panel" role="tabpanel" className="lg:col-span-6">
      <div className="border-brand/40 relative overflow-hidden rounded-2xl border bg-[#121314] p-4 shadow-2xl sm:p-6">
        <BlueprintPlate
          id={STEP_PLATE_MAP[current.id] ?? 'horus'}
          variant="watermark"
          className="pointer-events-none absolute -top-6 -right-6 z-0 size-48 opacity-20 sm:size-60 sm:opacity-25"
        />
        {/* Kestrel Signature Elliptical Radial Border Glow Mask */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-2xl select-none"
          style={{
            border: '0.5px solid #ff3616',
            maskImage: 'radial-gradient(ellipse 60% 48% at 100% 0%, black 30%, transparent 72%)',
            WebkitMaskImage:
              'radial-gradient(ellipse 60% 48% at 100% 0%, black 30%, transparent 72%)',
            backgroundImage:
              'radial-gradient(ellipse 52% 44% at 100% 0%, rgba(255,54,22,0.12) 0%, transparent 70%)',
          }}
        />

        {/* Clean Workflow Step Header Bar (no fake macOS dots) */}
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-4">
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
            <span className="text-brand bg-brand/10 border-brand/30 rounded border px-2 py-0.5 text-[11px] font-bold">
              STEP {current.label}
            </span>
            <span className="text-fg font-semibold">{current.previewBadge}</span>
          </div>
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="bg-bull size-2 rounded-full" />
            <span className="text-bull font-semibold">{current.latency.toUpperCase()}</span>
          </div>
        </div>

        {/* 3-Step Visual Workflow Progress Bar */}
        <div className="relative z-10 mt-4 grid grid-cols-3 gap-2 font-mono text-[11px]">
          {[
            { num: 1, label: '1. Pick a Market' },
            { num: 2, label: '2. Deep Analysis' },
            { num: 3, label: '3. Levels & Risk' },
          ].map((item) => {
            const isCurrent = item.num === current.id;
            const isDone = item.num < current.id;
            return (
              <div
                key={item.num}
                className={cn(
                  'flex items-center justify-between rounded-lg border px-2.5 py-2 transition-colors',
                  isCurrent
                    ? 'border-brand/40 bg-brand/10 text-fg font-bold'
                    : isDone
                      ? 'border-bull/30 bg-bull/5 text-bull font-semibold'
                      : 'text-fg-subtle border-white/5 bg-black/30',
                )}
              >
                <span className="truncate">{item.label}</span>
                <IconArrowRight className="size-3 shrink-0 opacity-60" />
              </div>
            );
          })}
        </div>

        {/* Step Product Preview Card + Briefing Output Surface */}
        <AnimatePresence mode="wait">
          <m.div
            key={current.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 mt-4 flex flex-col gap-3"
          >
            {/* Clean Product Preview Highlights */}
            <div className="surface-well rounded-xl border border-white/10 bg-[#0b0c0d] p-4">
              <div className="text-fg mb-3 font-mono text-xs font-bold sm:text-sm">
                {current.previewHeadline}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {current.previewHighlights.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-lg border border-white/5 bg-black/50 p-2.5 font-mono"
                  >
                    <span className="text-fg-subtle block text-[11px] uppercase">{item.label}</span>
                    <span
                      className={cn(
                        'mt-1 inline-block rounded border px-1.5 py-0.5 text-[11px] font-semibold',
                        TONE_CLASSES[item.tone],
                      )}
                    >
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Structured Briefing Output */}
            <div className="surface-well overflow-x-auto rounded-xl border border-white/5 bg-[#08090a] p-4 sm:p-5">
              <pre className="text-fg font-mono text-xs leading-relaxed font-medium whitespace-pre sm:text-[13px]">
                <code>{current.codeHighlighted}</code>
              </pre>
            </div>
          </m.div>
        </AnimatePresence>

        {/* Live Stage Telemetry Metrics Grid */}
        <div className="relative z-10 mt-4 grid grid-cols-1 gap-2 font-mono text-xs sm:grid-cols-3 sm:gap-2.5">
          {current.telemetry.map((item, idx) => (
            <div
              key={idx}
              className="surface-well flex flex-col gap-0.5 rounded-lg border border-white/5 bg-black/40 p-2.5"
            >
              <span className="text-fg-subtle text-[11px] uppercase">{item.label}</span>
              <span className="text-fg truncate text-[11px] font-bold">{item.value}</span>
            </div>
          ))}
        </div>

        {/* Dynamic Pipeline Circuit Footer */}
        <div className="relative z-10 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-3.5 font-mono text-xs">
          <div className="flex items-center gap-2">
            <IconActivity className="text-brand size-4" />
            <span className="text-fg-subtle">WORKFLOW PROGRESS:</span>
            <span className="text-bull font-semibold tabular-nums">{current.latency}</span>
          </div>
          <div className="text-brand flex items-center gap-1.5">
            <IconFlame className="size-3.5" />
            <span>1.0% Risk-Checked Workflow</span>
          </div>
        </div>
      </div>
    </div>
  );
}
