'use client';

// SPDX-License-Identifier: Apache-2.0

// Right console of the landing desks section: presents the selected analysis
// angle in plain English with clean visual indicators, sample live metrics,
// capabilities, and sample questions traders can ask.
import { IconCheck, IconMessageCircleQuestion } from '@tabler/icons-react';
import { AnimatePresence, m } from 'motion/react';

import { BlueprintPlate } from '@/components/brand/blueprint-plates';
import { cn } from '@/lib/formatters/cn';

import type { DeskSpec } from './desks';

interface DeskConsoleProps {
  desk: DeskSpec;
}

export function DeskConsole({ desk }: DeskConsoleProps) {
  return (
    <AnimatePresence mode="wait">
      <m.div
        key={desk.id}
        id={`desk-panel-${desk.id}`}
        role="tabpanel"
        aria-labelledby={`desk-tab-${desk.id}`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="relative flex h-full flex-col justify-between overflow-hidden p-4 sm:p-7"
      >
        <BlueprintPlate
          id={desk.blueprintId}
          variant="watermark"
          className="pointer-events-none absolute -right-6 -bottom-6 z-0 size-52 opacity-22 sm:size-68 sm:opacity-28"
        />
        {/* Panel Top Header Bar */}
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span className="text-fg-subtle rounded-md border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[11px] font-semibold tracking-wider uppercase">
              {desk.badge}
            </span>
            <span className="text-fg-muted font-mono text-[11px] sm:text-xs">
              Focus: <strong className="text-fg font-semibold">{desk.methodology}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="bg-bull size-2 rounded-full" />
            <span
              className={cn(
                'rounded border px-2.5 py-0.5 font-mono text-xs font-bold',
                desk.borderColor,
                desk.color,
              )}
            >
              {desk.verdict.bias} · {desk.verdict.conviction}%
            </span>
          </div>
        </div>

        {/* Angle Identity Title */}
        <div className="relative z-10 my-4 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <h3 className="font-display text-fg text-xl font-normal tracking-tight sm:text-2xl">
            {desk.name}{' '}
            <span className="text-fg-muted font-sans text-sm font-normal sm:text-base">
              · {desk.role}
            </span>
          </h3>
          <span className="text-fg-subtle font-mono text-[11px] uppercase">
            Sample XAU/USD Read
          </span>
        </div>

        {/* Sample Metrics Strip */}
        <div className="relative z-10 mb-5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {desk.sampleMetrics.map((metric) => (
            <div
              key={metric.label}
              className="surface-well flex flex-col justify-between rounded-xl border border-white/10 bg-[#0b0c0d] p-3"
            >
              <span className="text-fg-subtle font-mono text-[11px] uppercase">{metric.label}</span>
              <span className="text-fg mt-1 font-mono text-sm font-bold tabular-nums">
                {metric.value}
              </span>
              <span className={cn('mt-1 font-mono text-[11px] font-medium', desk.color)}>
                {metric.status}
              </span>
            </div>
          ))}
        </div>

        {/* Inner 2-Column Split: Capabilities & Sample Questions + Active Read */}
        <div className="relative z-10 grid items-start gap-6 md:grid-cols-12">
          {/* Left sub-column: What This Angle Checks (7 cols) */}
          <div className="flex flex-col gap-3 md:col-span-7">
            <div className="text-fg-subtle font-mono text-[11px] tracking-wider uppercase">
              What This Angle Evaluates
            </div>
            <div className="flex flex-col gap-2.5">
              {desk.features.map((feat, idx) => (
                <div key={idx} className="flex items-start gap-2.5">
                  <div className="bg-brand/10 border-brand/20 text-brand mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border">
                    <IconCheck className="size-2.5" />
                  </div>
                  <span className="text-fg-muted font-sans text-xs leading-relaxed sm:text-sm">
                    {feat}
                  </span>
                </div>
              ))}
            </div>

            {/* Sample Questions Users Can Ask */}
            <div className="mt-2 border-t border-white/10 pt-3">
              <div className="text-fg-subtle mb-2 flex items-center gap-1.5 font-mono text-[11px] tracking-wider uppercase">
                <IconMessageCircleQuestion className="text-brand size-3.5" />
                <span>Sample Questions You Can Ask</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {desk.sampleQuestions.map((question) => (
                  <div
                    key={question}
                    className="text-fg-muted rounded-lg border border-white/5 bg-black/40 px-3 py-2 font-sans text-xs leading-snug"
                  >
                    &ldquo;{question}&rdquo;
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right sub-column: Sample Analysis Read (5 cols) */}
          <div className="flex flex-col gap-3 md:col-span-5">
            <div className="text-fg-subtle font-mono text-[11px] tracking-wider uppercase">
              Sample Analysis Takeaway
            </div>

            <div className="surface-well rounded-lg border border-white/5 bg-black/60 p-3.5">
              <div className="text-fg-subtle font-mono text-[11px] uppercase">KEY SIGNAL</div>
              <div className="text-fg mt-1 font-mono text-xs font-bold sm:text-sm">
                {desk.verdict.keyMetric}
              </div>
            </div>

            <div className="surface-well text-fg-muted rounded-lg border border-white/5 bg-black/60 p-3.5 font-sans text-xs leading-relaxed">
              <span className="text-fg-subtle mb-1 block font-mono text-[11px] uppercase">
                PLAIN-ENGLISH SUMMARY
              </span>
              &ldquo;{desk.verdict.rationale}&rdquo;
            </div>
          </div>
        </div>

        {/* Bottom: Conviction Progress Bar */}
        <div className="relative z-10 mt-5 border-t border-white/10 pt-4">
          <div className="mb-1.5 flex items-center justify-between font-mono text-[11px]">
            <span className="text-fg-subtle tracking-wider uppercase">Angle Conviction Score</span>
            <span className="text-fg font-bold tabular-nums">{desk.verdict.conviction} / 100</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
            <m.div
              className="bg-brand h-full rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${desk.verdict.conviction}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
        </div>
      </m.div>
    </AnimatePresence>
  );
}
