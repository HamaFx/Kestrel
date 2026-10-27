'use client';

// SPDX-License-Identifier: Apache-2.0

// Tactile instrument primitives shared by the Certified Syndicate Dossier and
// the convene_committee renderer: four deep `#0a0b0c` wells (Entry, SL, TP1,
// TP2) and the Bull/Bear Tug-of-War consensus bar from the landing simulator.
import { m } from 'motion/react';

import { cn } from '@/lib/formatters/cn';

export interface InstrumentWell {
  label: string;
  value: string | number;
  tone?: 'default' | 'bull' | 'bear' | 'warn';
}

export function InstrumentWells({
  levels,
  rr,
}: {
  /** Ordered wells; the dossier passes Entry/SL/TP1/TP2. */
  levels: readonly InstrumentWell[];
  /** R:R label appended to the runner well when the caller has one. */
  rr?: string;
}) {
  return (
    <div
      className={cn(
        'grid gap-2 font-mono tabular-nums',
        levels.length === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-4',
      )}
    >
      {levels.map((level) => (
        <div
          key={level.label}
          className={cn(
            'surface-well bg-[#0a0b0c] rounded-lg border border-white/5 p-3 text-center',
            level.tone === 'bear' && 'border-bear/20',
          )}
        >
          <span
            className={cn(
              'block text-[10px] tracking-wider uppercase',
              level.tone === 'bull'
                ? 'text-bull'
                : level.tone === 'bear'
                  ? 'text-bear'
                  : level.tone === 'warn'
                    ? 'text-warn'
                    : 'text-fg-subtle',
            )}
          >
            {level.label}
            {level.label.startsWith('TP2') && rr ? ` (${rr})` : ''}
          </span>
          <span
            className={cn(
              'mt-0.5 block text-sm font-bold',
              level.tone === 'bull'
                ? 'text-bull'
                : level.tone === 'bear'
                  ? 'text-bear'
                  : 'text-fg',
            )}
          >
            {level.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Bull/Bear Tug-of-War consensus bar (adapted from `simulator-canvas.tsx`):
 * bull probability on the left, the remaining bear probability on the right,
 * and a marker bead at the split point.
 */
export function TugOfWarBar({ bullProbability }: { bullProbability: number }) {
  const bull = Math.min(100, Math.max(0, Math.round(bullProbability)));
  return (
    <div className="rounded-xl border border-white/5 bg-black/40 p-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2 font-mono text-[10px]">
        <span className="text-bull flex items-center gap-1.5 font-semibold">
          <span className="bg-bull size-1.5 rounded-full" />
          BULLISH {bull}%
        </span>
        <span className="text-fg-subtle tracking-wider">CONSENSUS</span>
        <span className="text-bear flex items-center gap-1.5 font-semibold">
          BEARISH {100 - bull}%
          <span className="bg-bear size-1.5 rounded-full" />
        </span>
      </div>
      <div className="relative flex h-1.5 overflow-hidden rounded-full bg-white/10">
        <m.div
          className="bg-bull h-full"
          initial={{ width: '50%' }}
          animate={{ width: `${bull}%` }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        />
        <m.div
          className="bg-bear h-full"
          initial={{ width: '50%' }}
          animate={{ width: `${100 - bull}%` }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        />
        <m.span
          className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.7)]"
          initial={{ left: '50%' }}
          animate={{ left: `${bull}%` }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
