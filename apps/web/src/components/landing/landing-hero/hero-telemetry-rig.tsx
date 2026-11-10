'use client';

// SPDX-License-Identifier: Apache-2.0

// Right 5-column instrument card of the landing hero: clean price header,
// minimalist optical SVG price-and-horizon curve, 4 single-line desk reads,
// and a hairline-divided Entry / Stop / Target strip.
import { m } from 'motion/react';

import { BlueprintPlate } from '@/components/brand/blueprint-plates';
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

export function HeroTelemetryRig({ activeSymbolIndex, onSelectSymbol }: HeroTelemetryRigProps) {
  const active = SYMBOLS[activeSymbolIndex] ?? SYMBOLS[0]!;
  const isLong = active.direction.startsWith('BUY');

  const desks = [
    { label: 'Macro & Yields', signal: active.macroSignal, bias: active.macroBias },
    { label: 'Price Structure', signal: active.techSignal, bias: active.techBias },
    { label: 'Risk Governor', signal: active.riskSignal, bias: active.riskBias },
    { label: 'COT Positioning', signal: active.sentimentSignal, bias: active.sentimentBias },
  ] as const;

  const curvePath = isLong
    ? 'M 0 102 C 48 106, 86 90, 132 94 C 178 98, 214 70, 264 68 C 306 66, 344 38, 400 26'
    : 'M 0 34 C 48 30, 86 46, 132 42 C 178 38, 214 66, 264 68 C 306 70, 344 98, 400 110';

  const areaPath = isLong
    ? `${curvePath} L 400 136 L 0 136 Z`
    : `${curvePath} L 400 136 L 0 136 Z`;

  const targetY = isLong ? 26 : 110;
  const stopY = isLong ? 112 : 24;

  return (
    <div className="relative lg:col-span-5">
      <div className="surface-panel relative z-10 overflow-hidden rounded-2xl border border-white/12 bg-[#141517]/95 p-6 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.1)]">
        <BlueprintPlate
          id="horus"
          variant="watermark"
          className="pointer-events-none absolute -top-8 -right-8 z-0 size-56 opacity-25"
        />

        {/* Top Bar: Live Status & Gliding Symbol Switcher */}
        <div className="relative z-10 flex items-center justify-between gap-2 border-b border-white/[0.08] pb-4">
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
        <div className="relative z-10 mt-5 flex items-baseline justify-between gap-3">
          <div>
            <div className="text-fg-subtle font-sans text-xs">{active.name}</div>
            <div className="mt-1 flex items-baseline gap-2.5">
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

        {/* Clean Optical SVG Price & Horizon Curve */}
        <div className="relative z-10 my-5 overflow-hidden rounded-xl border border-white/[0.07] bg-[#0a0b0d]">
          <svg
            viewBox="0 0 400 136"
            className=" block h-32 w-full select-none"
            role="img"
            aria-label={`${active.symbol} price trajectory and setup horizons`}
          >
            <defs>
              <linearGradient id="hero-curve-wash" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={isLong ? 'rgba(63,158,61,0.22)' : 'rgba(240,62,62,0.22)'}
                />
                <stop offset="100%" stopColor="rgba(10,11,13,0)" />
              </linearGradient>
            </defs>

            {/* Target, Entry, and Stop Hairlines */}
            <line
              x1="0"
              y1={targetY}
              x2="400"
              y2={targetY}
              stroke="rgba(63,158,61,0.4)"
              strokeDasharray="3 4"
            />
            <line
              x1="0"
              y1="68"
              x2="400"
              y2="68"
              stroke="rgba(255,255,255,0.18)"
              strokeDasharray="2 4"
            />
            <line
              x1="0"
              y1={stopY}
              x2="400"
              y2={stopY}
              stroke="rgba(240,62,62,0.4)"
              strokeDasharray="3 4"
            />

            {/* Area Fill & Smooth Price Curve */}
            <path d={areaPath} fill="url(#hero-curve-wash)" />
            <m.path
              key={active.symbol}
              d={curvePath}
              fill="none"
              stroke={isLong ? '#3f9e3d' : '#f03e3e'}
              strokeWidth="2"
              initial={{ pathLength: 0, opacity: 0.4 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.65, ease: 'easeOut' }}
            />

            {/* Entry Anchor & Active Pulse Node */}
            <circle cx="264" cy="68" r="3.5" fill="#f3f2ee" stroke="#0a0b0d" strokeWidth="1.5" />
            <circle
              cx="400"
              cy={targetY}
              r="4"
              fill={isLong ? '#3f9e3d' : '#f03e3e'}
            />
          </svg>
        </div>

        {/* 4 Single-Line Specialist Desk Reads (Unboxed) */}
        <div className="relative z-10 divide-y divide-white/[0.06] border-t border-white/[0.08]">
          {desks.map((desk) => (
            <div
              key={desk.label}
              className="flex items-center justify-between gap-4 py-2.5 text-xs"
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
        <div className="relative z-10 mt-3 grid grid-cols-3 divide-x divide-white/[0.08] border-t border-white/[0.08] pt-4 font-mono text-xs tabular-nums">
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
