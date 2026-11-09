'use client';

// SPDX-License-Identifier: Apache-2.0

// Tactile 2-segment analysis-mode pill: `Quick Answer` vs `Deep Analysis`,
// with clean vector icons and a spring `layoutId` highlight.
import { IconBolt, IconSparkles } from '@tabler/icons-react';
import { m } from 'motion/react';

import type { AnalysisMode } from '@/lib/analysis-mode';
import { cn } from '@/lib/formatters/cn';

const MODE_LABELS: Record<AnalysisMode, string> = {
  single: 'Quick Answer',
  full: 'Deep Analysis',
};

const MODE_DESCRIPTIONS: Record<AnalysisMode, string> = {
  single: 'Fast single AI answer with live market data checks.',
  full: 'Complete 4-angle analysis: Economy, Chart Levels, Risk Sizing & Market Sentiment.',
};

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
      className="border-border bg-bg-elev-2 relative inline-flex h-9 shrink-0 items-center gap-0.5 rounded-lg border p-0.5"
    >
      {(['single', 'full'] as const).map((mode) => {
        const isActive = analysisMode === mode;
        const Icon = mode === 'full' ? IconSparkles : IconBolt;
        return (
          <button
            key={mode}
            type="button"
            aria-pressed={isActive}
            title={MODE_DESCRIPTIONS[mode]}
            aria-label={`Analysis mode: ${MODE_LABELS[mode]}`}
            onClick={() => onAnalysisModeChange(mode)}
            className={cn(
              'relative z-10 inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium whitespace-nowrap transition-colors',
              isActive
                ? mode === 'full'
                  ? 'text-brand font-semibold'
                  : 'text-fg font-semibold'
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
            <Icon className="size-3.5 shrink-0" strokeWidth={2} />
            <span>{MODE_LABELS[mode]}</span>
          </button>
        );
      })}
    </div>
  );
}
