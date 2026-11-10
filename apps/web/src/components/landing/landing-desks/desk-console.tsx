'use client';

// SPDX-License-Identifier: Apache-2.0

// Open architectural column for each specialist desk in #desks, featuring its
// signature 3-Layer Sovereign Blueprint Plate (chiaroscuro classical sculpture,
// 3px micro-pixel halftone screen, and kinetic CAD SVG reticle), concise copy,
// and hairline-separated metrics.
import { BlueprintPlate } from '@/components/brand/blueprint-plates';

import type { DeskSpec } from './desks';

interface DeskConsoleProps {
  desk: DeskSpec;
}

export function DeskConsole({ desk }: DeskConsoleProps) {
  return (
    <article className="group flex flex-col justify-between p-6 transition-colors duration-200 hover:bg-white/[0.015] sm:p-8">
      <div>
        {/* Minimalist Index & Conviction Header */}
        <div className="flex items-center justify-between font-mono text-xs">
          <span className="text-brand font-bold tracking-wider">
            {desk.index} // {desk.code}
          </span>
          <span className="text-fg-subtle tabular-nums">{desk.confidence}%</span>
        </div>

        {/* 3-Layer Sovereign Blueprint Plate (Chiaroscuro + Kinetic CAD Reticle) */}
        <div className="my-6">
          <BlueprintPlate
            id={desk.blueprintId}
            variant="compact"
            className="h-[196px] w-full"
          />
        </div>

        {/* Title & Single-Sentence Copy */}
        <h3 className="font-display text-fg text-2xl font-normal tracking-tight">
          {desk.name}
        </h3>
        <p className="text-fg-muted mt-2.5 font-sans text-sm leading-relaxed">
          {desk.summary}
        </p>
      </div>

      {/* Unboxed Hairline Spec Rows */}
      <div className="mt-7 divide-y divide-white/[0.06] border-t border-white/[0.08] font-mono text-xs">
        {desk.metrics.map((metric) => (
          <div key={metric.label} className="flex items-center justify-between py-2.5">
            <span className="text-fg-subtle text-[11px] uppercase">{metric.label}</span>
            <span className="text-fg font-semibold tabular-nums">{metric.value}</span>
          </div>
        ))}
      </div>
    </article>
  );
}
