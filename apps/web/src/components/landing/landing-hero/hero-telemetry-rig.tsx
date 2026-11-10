'use client';

// SPDX-License-Identifier: Apache-2.0

// Right 5-column instrument card of the landing hero: live symbol switcher,
// interactive 3-Layer Sovereign Plate viewport (blending chiaroscuro classical
// engravings, 3px micro-pixel halftone screen, and kinetic CAD SVG reticles),
// 4 single-line desk reads, and a hairline-divided Entry / Stop / Target strip.
import { m } from 'motion/react';

import { BlueprintPlate, type BlueprintPlateId } from '@/components/brand/blueprint-plates';
import { cn } from '@/lib/formatters/cn';

import { SYMBOLS, type DeskBias } from './telemetry';

interface HeroTelemetryRigProps {
  activeSymbolIndex: number;
  onSelectSymbol: (index: number) => void;
}

const BIAS_DOT: Record<DeskBias, string> = {
  BULL: 'bg-bull shadow-[0_0_6px_#3f9e3d]',
  BEAR: 'bg-bear shadow-[0_0_6px_#f03e3e]',
  GUARD: 'bg-warn shadow-[0_0_6px_#d98f00]',
};

const BIAS_TEXT: Record<DeskBias, string> = {
  BULL: 'text-bull',
  BEAR: 'text-bear',
  GUARD: 'text-warn',
};

const SYMBOL_PLATES: readonly BlueprintPlateId[] = ['horus', 'obelisk', 'arbiter'];

export function HeroTelemetryRig({ activeSymbolIndex, onSelectSymbol }: HeroTelemetryRigProps) {
  const active = SYMBOLS[activeSymbolIndex] ?? SYMBOLS[0]!;
  const isLong = active.direction.startsWith('BUY');
  const activePlateId = SYMBOL_PLATES[activeSymbolIndex % SYMBOL_PLATES.length] ?? 'horus';

  const desks = [
    { label: 'Macro & Yields', signal: active.macroSignal, bias: active.macroBias },
    { label: 'Price Structure', signal: active.techSignal, bias: active.techBias },
    { label: 'Risk Governor', signal: active.riskSignal, bias: active.riskBias },
    { label: 'COT Positioning', signal: active.sentimentSignal, bias: active.sentimentBias },
  ] as const;

  return (
    <div className="relative lg:col-span-5">
      {/* Ambient Outer CAD & Chiaroscuro Halo */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-6 z-0 opacity-60 sm:-inset-8"
      >
        <BlueprintPlate id={activePlateId} variant="backdrop" className="h-full w-full" />
      </div>

      <div className="surface-panel relative z-10 overflow-hidden rounded-2xl border border-white/12 bg-[#141517]/95 p-5 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.1)] sm:p-6">
        {/* Top Bar: Live Status & Gliding Symbol Switcher */}
        <div className="relative z-10 flex items-center justify-between gap-2 border-b border-white/[0.08] pb-3.5">
          <div className="flex items-center gap-2">
            <span className="bg-bull size-2 rounded-full shadow-[0_0_8px_#3f9e3d]" />
            <span className="text-fg-subtle font-mono text-[11px] font-semibold tracking-wider uppercase">
              {active.sessionLabel}
            </span>
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-white/[0.07] bg-black/50 p-1">
            {SYMBOLS.map((s, idx) => {
              const isSelected = idx === activeSymbolIndex;
              return (
                <button
                  key={s.symbol}
                  type="button"
                  onClick={() => onSelectSymbol(idx)}
                  className={cn(
                    'relative rounded px-2.5 py-1 font-mono text-[11px] font-semibold transition-colors duration-200',
                    isSelected ? 'text-white' : 'text-fg-subtle hover:text-fg hover:bg-white/5',
                  )}
                >
                  {isSelected && (
                    <m.div
                      layoutId="hero-symbol-gliding-pill"
                      className="bg-brand absolute inset-0 -z-10 rounded shadow-sm"
                      transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                    />
                  )}
                  <span>{s.symbol.split('/')[0]}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Price & Conviction Readout */}
        <div className="relative z-10 mt-4 flex items-baseline justify-between gap-3">
          <div>
            <div className="text-fg-subtle font-sans text-xs">{active.name}</div>
            <div className="mt-0.5 flex items-baseline gap-2.5">
              <span className="text-fg font-mono text-3xl font-bold tracking-tight tabular-nums sm:text-4xl">
                {active.price}
              </span>
              <span
                className={cn(
                  'font-mono text-xs font-semibold tabular-nums',
                  active.isPositive ? 'text-bull' : 'text-bear',
                )}
              >
                {active.isPositive ? '▲' : '▼'} {active.change}
              </span>
            </div>
          </div>

          <div className="text-right font-mono">
            <span
              className={cn(
                'inline-block rounded border px-2 py-0.5 text-[11px] font-bold uppercase',
                isLong
                  ? 'border-bull/35 bg-bull/10 text-bull'
                  : 'border-bear/35 bg-bear/10 text-bear',
              )}
            >
              {active.direction}
            </span>
            <div className="text-fg-subtle mt-1 text-[11px] tabular-nums">
              {active.conviction}% Aligned · {active.rr} R:R
            </div>
          </div>
        </div>

        {/* Interactive 3-Layer Sovereign Plate Viewport (Chiaroscuro + Kinetic CAD SVG + Telemetry) */}
        <div className="relative z-10 my-4">
          <BlueprintPlate
            id={activePlateId}
            variant="showcase"
            allowLayerToggle
            className="h-[228px] w-full sm:h-[242px]"
          />
        </div>

        {/* 4 Single-Line Specialist Desk Reads */}
        <div className="relative z-10 divide-y divide-white/[0.06] border-t border-white/[0.08]">
          {desks.map((desk) => (
            <div
              key={desk.label}
              className="flex items-center justify-between gap-4 py-2 text-xs"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span className={cn('size-1.5 shrink-0 rounded-full', BIAS_DOT[desk.bias])} />
                <span className="text-fg shrink-0 font-sans font-medium">{desk.label}</span>
                <span className="text-fg-muted truncate font-mono text-[11px]">
                  · {desk.signal}
                </span>
              </div>
              <span
                className={cn(
                  'shrink-0 font-mono text-[11px] font-bold tracking-wider',
                  BIAS_TEXT[desk.bias],
                )}
              >
                {desk.bias}
              </span>
            </div>
          ))}
        </div>

        {/* Hairline-Divided Execution Levels Footer */}
        <div className="relative z-10 mt-2.5 grid grid-cols-3 divide-x divide-white/[0.08] border-t border-white/[0.08] pt-3.5 font-mono text-xs tabular-nums">
          <div className="pr-3">
            <span className="text-fg-subtle block text-[10px] uppercase">Entry</span>
            <span className="text-fg mt-0.5 block font-bold">{active.entry}</span>
          </div>
          <div className="px-3">
            <span className="text-fg-subtle block text-[10px] uppercase">
              Stop ({active.riskSize.split(' ')[0]})
            </span>
            <span className="text-bear mt-0.5 block font-bold">{active.invalidation}</span>
          </div>
          <div className="pl-3">
            <span className="text-fg-subtle block text-[10px] uppercase">
              Target ({active.rr})
            </span>
            <span className="text-bull mt-0.5 block font-bold">{active.target2}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
