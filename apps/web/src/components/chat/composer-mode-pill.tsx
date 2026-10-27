'use client';

// SPDX-License-Identifier: Apache-2.0

// Tactile 2-segment analysis-mode pill: `⚡ Fast Scout` / `🏛️ Convene Council`,
// with a spring `layoutId` glider (matching the landing HeroTelemetryRig) and
// the forge glow on the Convene Council segment when armed.
import { m } from 'motion/react';

import type { AnalysisMode } from '@/lib/analysis-mode';
import { cn } from '@/lib/formatters/cn';

import { MODE_DESCRIPTIONS, MODE_LABELS, MODE_LABELS_COMPACT } from './chat-top-bar/mode-labels';

export function ComposerModePill({
  analysisMode,
  onAnalysisModeChange,
}: {
  analysisMode: AnalysisMode;
  onAnalysisModeChange: (mode: AnalysisMode) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Analysis mode"
      className="border-border bg-bg-elev-2 relative inline-flex h-8 shrink-0 items-center gap-0.5 rounded-lg border p-0.5"
    >
      {(['single', 'full'] as const).map((mode) => {
        const isActive = analysisMode === mode;
        return (
          <button
            key={mode}
            type="button"
            aria-pressed={isActive}
            title={MODE_DESCRIPTIONS[mode]}
            aria-label={`Analysis mode: ${MODE_LABELS[mode]}`}
            onClick={() => onAnalysisModeChange(mode)}
            className={cn(
              'relative z-10 inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium whitespace-nowrap transition-colors',
              isActive
                ? mode === 'full'
                  ? 'text-brand'
                  : 'text-fg'
                : 'text-fg-subtle hover:text-fg',
            )}
          >
            {isActive ? (
              <m.span
                layoutId="composer-mode-pill"
                aria-hidden="true"
                className={cn(
                  'absolute inset-0 -z-10 rounded-md',
                  mode === 'full'
                    ? 'bg-brand/15 ring-brand/40 ring-1'
                    : 'bg-bg-elev-3 ring-border ring-1',
                )}
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              />
            ) : null}
            <span>{MODE_LABELS_COMPACT[mode]}</span>
          </button>
        );
      })}
    </div>
  );
}
