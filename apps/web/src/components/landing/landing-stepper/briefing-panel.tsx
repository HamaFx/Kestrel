'use client';

// SPDX-License-Identifier: Apache-2.0

// Live briefing preview workbench on the right of the landing stepper: window
// chrome, fading code surface, telemetry grid and the circuit footer.
import { IconActivity, IconFlame } from '@tabler/icons-react';
import { AnimatePresence, m } from 'motion/react';

import type { Step } from './steps';

interface BriefingPanelProps {
  current: Step;
}

export function BriefingPanel({ current }: BriefingPanelProps) {
  return (
    <div id="pipeline-detail-panel" role="tabpanel" className="lg:col-span-6">
      <div className="border-brand/40 relative overflow-hidden rounded-2xl border bg-[#121314] p-6 shadow-2xl">
        {/* Hoplite Signature Elliptical Radial Border Glow Mask */}
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

        {/* Workbench Header Bar */}
        <div className="relative z-10 flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-red-500/80" />
            <span className="size-2.5 rounded-full bg-amber-500/80" />
            <span className="size-2.5 rounded-full bg-emerald-500/80" />
            <span className="text-fg-subtle ml-2 font-mono text-xs">
              kestrel / briefing / {current.fileName}
            </span>
          </div>
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="bg-bull size-2 animate-pulse rounded-full" />
            <span className="text-bull font-semibold">STAGE {current.label} VERIFIED</span>
          </div>
        </div>

        {/* Briefing Output Surface with Smooth Fade */}
        <AnimatePresence mode="wait">
          <m.div
            key={current.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="surface-well relative z-10 mt-4 overflow-x-auto rounded-xl border border-white/5 bg-[#08090a] p-5"
          >
            <pre className="text-fg font-mono text-xs leading-relaxed font-medium whitespace-pre sm:text-[13px]">
              <code>{current.codeHighlighted}</code>
            </pre>
          </m.div>
        </AnimatePresence>

        {/* Live Stage Telemetry Metrics Grid */}
        <div className="relative z-10 mt-4 grid grid-cols-3 gap-2.5 font-mono text-xs">
          {current.telemetry.map((item, idx) => (
            <div
              key={idx}
              className="surface-well flex flex-col gap-0.5 rounded-lg border border-white/5 bg-black/40 p-2.5"
            >
              <span className="text-fg-subtle text-[9px] uppercase">{item.label}</span>
              <span className="text-fg truncate text-[11px] font-bold">{item.value}</span>
            </div>
          ))}
        </div>

        {/* Dynamic Pipeline Circuit Footer */}
        <div className="relative z-10 mt-4 flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] p-3.5 font-mono text-xs">
          <div className="flex items-center gap-2">
            <IconActivity className="text-brand size-4" />
            <span className="text-fg-subtle">WORKFLOW STAGE:</span>
            <span className="text-bull font-semibold tabular-nums">{current.latency}</span>
          </div>
          <div className="text-brand flex items-center gap-1.5">
            <IconFlame className="size-3.5" />
            <span>Verified Trade Protocol</span>
          </div>
        </div>
      </div>
    </div>
  );
}
