'use client';

// SPDX-License-Identifier: Apache-2.0

// Live telemetry console for the currently effective architecture layer.
import { IconLayersLinked } from '@tabler/icons-react';
import { AnimatePresence, m } from 'motion/react';

import type { LayerSpec } from './layers';

interface ArchitectureTelemetryConsoleProps {
  activeLayer: LayerSpec;
}

export function ArchitectureTelemetryConsole({ activeLayer }: ArchitectureTelemetryConsoleProps) {
  return (
    <div className="surface-panel relative flex flex-col gap-5 overflow-hidden rounded-2xl border border-white/15 bg-[#121314] p-6 shadow-2xl">
      {/* Lit Corner Flare */}
      <div
        aria-hidden="true"
        className="bg-brand/10 pointer-events-none absolute -top-12 -right-12 size-32 rounded-full blur-2xl select-none"
      />

      <div className="relative z-10 flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <span className="bg-brand size-2 animate-pulse rounded-full shadow-[0_0_8px_#ff3616]" />
          <span className="text-brand font-mono text-[10px] font-bold tracking-wider uppercase">
            TIER {activeLayer.num} TELEMETRY
          </span>
        </div>
        <div className="text-bull flex items-center gap-1 font-mono text-[10px]">
          <IconLayersLinked className="size-3.5" />
          <span>SYNCED</span>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <m.div
          key={activeLayer.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.18 }}
          className="relative z-10 flex flex-col gap-4"
        >
          <div>
            <h3 className="font-display text-fg text-xl font-normal tracking-tight">
              {activeLayer.title}
            </h3>
            <p className="text-fg-muted mt-2 font-sans text-xs leading-relaxed">
              {activeLayer.fullDesc}
            </p>
          </div>

          {/* Telemetry Metrics */}
          <div className="flex flex-col gap-2 border-t border-white/10 pt-2 font-mono text-xs">
            {activeLayer.telemetry.map((t, idx) => (
              <div
                key={idx}
                className="surface-well flex flex-col gap-0.5 rounded-lg border border-white/5 bg-black/40 p-2.5"
              >
                <span className="text-fg-subtle text-[9px] uppercase">{t.label}</span>
                <span className="text-fg truncate text-[11px] font-bold">{t.value}</span>
              </div>
            ))}
          </div>
        </m.div>
      </AnimatePresence>
    </div>
  );
}
