'use client';

// SPDX-License-Identifier: Apache-2.0

// Right console of the landing desks section: the active desk briefing cockpit
// rendered inside the shared milled frame, featuring a Dual-Plate Sovereign
// Showcase (blending the original sculpture + newly commissioned chiaroscuro
// plate + CAD SVG reticle + ASCII telemetry) for both mobile and desktop.
import { IconCheck } from '@tabler/icons-react';
import { AnimatePresence, m } from 'motion/react';
import { useState } from 'react';

import { BlueprintPlate, PLATE_SUBTITLE } from '@/components/brand/blueprint-plates';
import { cn } from '@/lib/formatters/cn';

import type { DeskSpec } from './desks';

interface DeskConsoleProps {
  desk: DeskSpec;
}

export function DeskConsole({ desk }: DeskConsoleProps) {
  const [showCompanionPlate, setShowCompanionPlate] = useState(false);
  const activePlateId = showCompanionPlate ? desk.pairedBlueprintId : desk.blueprintId;

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
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 opacity-35">
          <BlueprintPlate id={activePlateId} showRasterBackup className="h-full w-full" />
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 bg-[#121315]/75"
        />

        {/* Panel Top Header Bar */}
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span className="text-fg-subtle rounded-md border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[11px] font-semibold tracking-wider uppercase">
              {desk.badge}
            </span>
            <span className="text-fg-muted font-mono text-[11px] sm:text-xs">
              Methodology: <strong className="text-fg font-semibold">{desk.methodology}</strong>
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

        {/* Desk Identity Title & Dual-Plate Switcher */}
        <div className="relative z-10 my-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="font-display text-fg text-xl font-normal tracking-tight sm:text-2xl">
            {desk.name}{' '}
            <span className="text-fg-muted font-sans text-sm font-normal sm:text-base">
              · {desk.role}
            </span>
          </h3>

          <div className="flex items-center gap-1 self-start rounded-lg border border-white/10 bg-black/50 p-1 sm:self-auto">
            <button
              type="button"
              onClick={() => setShowCompanionPlate(false)}
              className={cn(
                'rounded px-2.5 py-1 font-mono text-[10px] font-semibold tracking-wider uppercase transition-colors',
                !showCompanionPlate ? 'bg-brand text-white' : 'text-fg-subtle hover:text-fg',
              )}
            >
              Primary Art
            </button>
            <button
              type="button"
              onClick={() => setShowCompanionPlate(true)}
              className={cn(
                'rounded px-2.5 py-1 font-mono text-[10px] font-semibold tracking-wider uppercase transition-colors',
                showCompanionPlate ? 'bg-brand text-white' : 'text-fg-subtle hover:text-fg',
              )}
            >
              Paired Engraving
            </button>
          </div>
        </div>

        {/* Dedicated 3-Layer Sovereign Plate Viewport (Mobile & Desktop) */}
        <div className="relative z-10 mb-5">
          <BlueprintPlate
            id={activePlateId}
            variant="showcase"
            showRasterBackup
            allowLayerToggle
            className="h-[210px] w-full sm:h-[230px]"
          />
          <div className="text-fg-subtle mt-1.5 flex items-center justify-between font-mono text-[10px]">
            <span>ACTIVE PLATE: {PLATE_SUBTITLE[activePlateId]}</span>
            <span className="text-brand">CHIAROSCURO + CAD SVG + ASCII</span>
          </div>
        </div>

        {/* Inner 2-Column Split: Capabilities & Deliberation Telemetry */}
        <div className="relative z-10 grid items-start gap-6 md:grid-cols-12">
          {/* Left sub-column: Capabilities (7 cols) */}
          <div className="flex flex-col gap-3 md:col-span-7">
            <div className="text-fg-subtle font-mono text-[10px] tracking-wider uppercase">
              Execution Protocol & Scanning
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
          </div>

          {/* Right sub-column: Deliberation & Telemetry Rig (5 cols) */}
          <div className="flex flex-col gap-3 md:col-span-5">
            <div className="text-fg-subtle font-mono text-[10px] tracking-wider uppercase">
              Active Deliberation
            </div>

            <div className="surface-well rounded-lg border border-white/5 bg-black/60 p-3">
              <div className="text-fg-subtle font-mono text-[10px] uppercase">
                PRIMARY DECISION METRIC
              </div>
              <div className="text-fg mt-1 font-mono text-xs font-bold sm:text-sm">
                {desk.verdict.keyMetric}
              </div>
            </div>

            <div className="surface-well text-fg-muted rounded-lg border border-white/5 bg-black/60 p-3 font-sans text-xs leading-relaxed">
              <span className="text-fg-subtle mb-1 block font-mono text-[10px] uppercase">
                DELIBERATION RATIONALE
              </span>
              &ldquo;{desk.verdict.rationale}&rdquo;
            </div>
          </div>
        </div>

        {/* Bottom: Conviction Progress Bar */}
        <div className="relative z-10 mt-5 border-t border-white/10 pt-4">
          <div className="mb-1.5 flex items-center justify-between font-mono text-[11px]">
            <span className="text-fg-subtle tracking-wider uppercase">Syndicate Conviction</span>
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
