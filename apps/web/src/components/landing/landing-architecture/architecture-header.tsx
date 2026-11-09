'use client';

// SPDX-License-Identifier: Apache-2.0

// Section header for `LandingArchitecture`: frames Kestrel's Unfair Trading
// Superpowers and the interactive Green-Light vs. Trap-Blocker toggle.
import { IconBolt, IconShieldLock } from '@tabler/icons-react';
import { m } from 'motion/react';

import { cn } from '@/lib/formatters/cn';

import type { ConduitMode } from './layers';

interface ArchitectureHeaderProps {
  mode: ConduitMode;
  onSelectMode: (mode: ConduitMode) => void;
}

export function ArchitectureHeader({ mode, onSelectMode }: ArchitectureHeaderProps) {
  return (
    <div className="mb-10 flex flex-col items-center gap-4 text-center sm:mb-12">
      <div className="border-brand/30 bg-brand/10 inline-flex items-center gap-2 rounded-full border px-3.5 py-1 font-mono text-xs">
        <span className="bg-brand size-2 rounded-full shadow-[0_0_8px_#ff3616]" />
        <span className="text-brand font-semibold tracking-wider uppercase">
          Unfair Trading Superpowers
        </span>
      </div>

      <h2 className="font-display text-fg max-w-3xl text-3xl font-normal tracking-[-0.03em] sm:text-5xl">
        BUILT TO PROTECT{' '}
        <span className="font-redaction-35 text-brand italic">And Multiply Your Edge</span>
      </h2>
      <p className="text-fg-muted max-w-2xl font-sans text-sm leading-relaxed sm:text-base">
        Great trading is half catching clean moves and half dodging bad traps. Test the 1% Shield
        below, then explore the tools that keep you ahead of the market 24/7.
      </p>

      {/* Interactive 2-State Switcher */}
      <div
        role="tablist"
        aria-label="Shield simulation mode"
        className="mt-1 inline-flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-white/10 bg-[#141517] p-1.5 shadow-lg"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'approved'}
          onClick={() => onSelectMode('approved')}
          className={cn(
            'relative inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-mono text-xs font-semibold transition-colors active:translate-y-[0.5px]',
            mode === 'approved' ? 'text-white' : 'text-fg-muted hover:text-fg',
          )}
        >
          {mode === 'approved' && (
            <m.div
              layoutId="arch-conduit-mode-pill"
              className="border-bull/50 bg-bull/20 absolute inset-0 -z-10 rounded-xl border shadow-[0_0_20px_rgba(63,158,61,0.25)]"
              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            />
          )}
          <IconBolt
            className={cn('size-4', mode === 'approved' ? 'text-bull' : 'text-fg-subtle')}
          />
          <span>Clean Breakout (Green Light)</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={mode === 'blocked'}
          onClick={() => onSelectMode('blocked')}
          className={cn(
            'relative inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-mono text-xs font-semibold transition-colors active:translate-y-[0.5px]',
            mode === 'blocked' ? 'text-white' : 'text-fg-muted hover:text-fg',
          )}
        >
          {mode === 'blocked' && (
            <m.div
              layoutId="arch-conduit-mode-pill"
              className="border-bear/50 bg-bear/20 absolute inset-0 -z-10 rounded-xl border shadow-[0_0_20px_rgba(240,62,62,0.28)]"
              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            />
          )}
          <IconShieldLock
            className={cn('size-4', mode === 'blocked' ? 'text-bear' : 'text-fg-subtle')}
          />
          <span>FOMO & News Trap (Blocked)</span>
        </button>
      </div>
    </div>
  );
}
