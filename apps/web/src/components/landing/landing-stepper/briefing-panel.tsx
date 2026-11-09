'use client';

// SPDX-License-Identifier: Apache-2.0

// Simplified, high-craft 4-scene Motion Graphics stage on the right of
// `LandingStepper`.
import { IconSparkles } from '@tabler/icons-react';
import { AnimatePresence, m } from 'motion/react';

import {
  SceneAutoSizedRisk,
  SceneInstantClarity,
  SceneSnapOrAsk,
  SceneWalkAway,
} from './stepper-scenes';
import type { Step } from './steps';

interface BriefingPanelProps {
  current: Step;
}

export function BriefingPanel({ current }: BriefingPanelProps) {
  return (
    <div id="pipeline-detail-panel" role="tabpanel" className="lg:col-span-6">
      <div className="border-brand/40 relative overflow-hidden rounded-3xl border bg-[#121315] p-5 shadow-2xl sm:p-7">
        {/* Top-Right Forge Border Glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-3xl select-none"
          style={{
            border: '0.5px solid #ff3616',
            maskImage: 'radial-gradient(ellipse 60% 48% at 100% 0%, black 30%, transparent 72%)',
            WebkitMaskImage:
              'radial-gradient(ellipse 60% 48% at 100% 0%, black 30%, transparent 72%)',
            backgroundImage:
              'radial-gradient(ellipse 52% 44% at 100% 0%, rgba(255,54,22,0.14) 0%, transparent 70%)',
          }}
        />

        {/* Clean Header Bar */}
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-4">
          <div className="flex items-center gap-2">
            <span className="bg-brand size-2 rounded-full shadow-[0_0_8px_#ff3616]" />
            <span className="text-brand font-mono text-xs font-bold tracking-wider uppercase">
              {current.sceneBadge}
            </span>
          </div>
          <span className="text-bull bg-bull/10 border-bull/30 rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-bold">
            STEP {current.label} OF 04
          </span>
        </div>

        {/* Full-Bleed Choreographed Visual Motion Stage */}
        <AnimatePresence mode="wait">
          <m.div
            key={current.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 mt-4 flex flex-col gap-4"
          >
            <div>
              <h4 className="font-display text-fg text-xl font-normal tracking-tight sm:text-2xl">
                {current.sceneTitle}
              </h4>
              <p className="text-fg-muted mt-1 font-sans text-xs sm:text-sm">
                {current.sceneSubtitle}
              </p>
            </div>

            <div className="surface-well overflow-hidden rounded-2xl border border-white/10 bg-[#08090b] p-4">
              {current.id === 1 && <SceneSnapOrAsk />}
              {current.id === 2 && <SceneInstantClarity />}
              {current.id === 3 && <SceneAutoSizedRisk />}
              {current.id === 4 && <SceneWalkAway />}
            </div>

            {/* Single Clean Takeaway Strip */}
            <div className="flex items-center gap-2.5 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3 font-sans text-xs sm:text-sm">
              <IconSparkles className="text-brand size-4 shrink-0" />
              <span className="text-fg font-medium">{current.takeaway}</span>
            </div>
          </m.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
