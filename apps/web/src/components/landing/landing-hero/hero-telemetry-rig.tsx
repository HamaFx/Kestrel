'use client';

// SPDX-License-Identifier: Apache-2.0

// Right column of the landing hero: the interactive hardware telemetry rig
// with symbol switcher, live price card, 3D hologram, desk chips and the
// committee trade plan.
import { IconBuildingBank, IconChartCandle, IconRadar, IconScale } from '@tabler/icons-react';
import { m } from 'motion/react';
import dynamic from 'next/dynamic';

import { cn } from '@/lib/formatters/cn';

import { SYMBOLS } from './telemetry';

// The hologram pulls in three.js (~154 KB gzip). It already defers rendering
// via IntersectionObserver, so keep it out of the synchronous landing bundle
// and load it only when the client hydrates.
const Landing3DHologram = dynamic(
  () => import('@/components/landing/landing-3d-hologram').then((m) => m.Landing3DHologram),
  { ssr: false },
);

interface HeroTelemetryRigProps {
  activeSymbolIndex: number;
  onSelectSymbol: (index: number) => void;
}

export function HeroTelemetryRig({ activeSymbolIndex, onSelectSymbol }: HeroTelemetryRigProps) {
  const active = SYMBOLS[activeSymbolIndex] ?? SYMBOLS[0]!;

  return (
    <div className="lg:col-span-5">
      <div className="surface-panel relative overflow-hidden rounded-2xl border border-white/15 bg-[#141516]/95 p-5 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.12)] sm:p-6">
        {/* Header Status & Symbol Switcher */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3.5">
          <div className="flex items-center gap-2">
            <span className="bg-bull size-2 animate-pulse rounded-full shadow-[0_0_8px_#3f9e3d]" />
            <span className="text-fg font-mono text-xs font-bold tracking-wider uppercase">
              LIVE COMMITTEE BRIEFING
            </span>
          </div>

          {/* Symbol Pills with Fluid Gliding Indicator */}
          <div className="flex items-center gap-1 rounded-lg border border-white/5 bg-black/40 p-1">
            {SYMBOLS.map((s, idx) => {
              const isSelected = idx === activeSymbolIndex;
              return (
                <button
                  key={s.symbol}
                  type="button"
                  onClick={() => onSelectSymbol(idx)}
                  className={cn(
                    'relative rounded px-2.5 py-1 font-mono text-[10px] font-semibold transition-colors duration-200 active:translate-y-[0.5px]',
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

        {/* Symbol Data Container */}
        <div key={active.symbol}>
          {/* Price Display */}
          <div className="surface-well my-4 rounded-xl border border-white/5 bg-[#0b0c0d] p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-fg-subtle font-sans text-xs tracking-wider uppercase">
                {active.name}
              </span>
              <span
                className={cn(
                  'font-mono text-xs font-semibold',
                  active.isPositive ? 'text-bull' : 'text-bear',
                )}
              >
                {active.isPositive ? '▲' : '▼'} {active.change}
              </span>
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <div className="text-fg font-mono text-3xl font-bold tracking-tight tabular-nums sm:text-4xl">
                {active.price}
              </div>
              <span className="text-fg-subtle font-mono text-[11px]">Spread: {active.spread}</span>
            </div>
          </div>

          {/* ── Real-Time Interactive 3D WebGL Hologram ── */}
          <div className="relative my-3 flex h-[190px] w-full items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/60 shadow-inner sm:h-[220px]">
            <div className="text-fg-subtle absolute top-2.5 left-3 z-10 flex items-center gap-2 font-mono text-[9px] select-none">
              <span className="bg-brand size-1.5 animate-ping rounded-full" />
              <span>MULTI-DESK CONSENSUS ENGINE</span>
            </div>
            <div className="text-brand/80 pointer-events-none absolute right-3 bottom-2 z-10 font-mono text-[9px] select-none">
              DRAG TO INSPECT
            </div>
            <Landing3DHologram className="h-full w-full" />
          </div>

          {/* 4 Hardware Specialist Desks Row */}
          <div className="grid grid-cols-4 gap-2 py-2">
            {/* Tech */}
            <div className="surface-chip hover:border-bull/40 flex flex-col items-center gap-1.5 rounded-lg border border-white/10 bg-[#151617] p-2 shadow-xs transition-colors">
              <div className="bg-bull/10 border-bull/20 text-bull flex size-7 items-center justify-center rounded border">
                <IconChartCandle className="size-4" />
              </div>
              <span className="text-bull font-mono text-[10px] font-bold uppercase">Tech</span>
              <span className="text-fg-subtle max-w-[64px] truncate text-center font-mono text-[9px]">
                {active.techSignal}
              </span>
            </div>

            {/* Macro */}
            <div className="surface-chip hover:border-info/40 flex flex-col items-center gap-1.5 rounded-lg border border-white/10 bg-[#151617] p-2 shadow-xs transition-colors">
              <div className="bg-info/10 border-info/20 text-info flex size-7 items-center justify-center rounded border">
                <IconBuildingBank className="size-4" />
              </div>
              <span className="text-info font-mono text-[10px] font-bold uppercase">Macro</span>
              <span className="text-fg-subtle max-w-[64px] truncate text-center font-mono text-[9px]">
                {active.macroSignal}
              </span>
            </div>

            {/* Risk */}
            <div className="surface-chip hover:border-warn/40 flex flex-col items-center gap-1.5 rounded-lg border border-white/10 bg-[#151617] p-2 shadow-xs transition-colors">
              <div className="bg-warn/10 border-warn/20 text-warn flex size-7 items-center justify-center rounded border">
                <IconScale className="size-4" />
              </div>
              <span className="text-warn font-mono text-[10px] font-bold uppercase">Risk</span>
              <span className="text-fg-subtle max-w-[64px] truncate text-center font-mono text-[9px]">
                {active.riskSignal}
              </span>
            </div>

            {/* Sentinel */}
            <div className="surface-chip hover:border-brand/40 flex flex-col items-center gap-1.5 rounded-lg border border-white/10 bg-[#151617] p-2 shadow-xs transition-colors">
              <div className="bg-brand/10 border-brand/20 text-brand flex size-7 items-center justify-center rounded border">
                <IconRadar className="size-4" />
              </div>
              <span className="text-brand font-mono text-[10px] font-bold uppercase">Whales</span>
              <span className="text-fg-subtle max-w-[64px] truncate text-center font-mono text-[9px]">
                {active.sentimentSignal}
              </span>
            </div>
          </div>

          {/* Consensus Trade Card */}
          <div className="border-brand/30 bg-brand/[0.06] mt-3 rounded-xl border p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-fg font-mono text-xs font-bold uppercase">
                  Committee Trade Plan
                </span>
                <span className="text-brand bg-brand/10 border-brand/20 rounded border px-1.5 py-0.5 font-mono text-[10px]">
                  {active.conviction}% Conviction
                </span>
              </div>
              <span
                className={cn(
                  'rounded border px-2 py-0.5 font-mono text-xs font-bold uppercase',
                  active.direction.startsWith('BUY')
                    ? 'text-bull bg-bull/10 border-bull/30'
                    : 'text-bear bg-bear/10 border-bear/30',
                )}
              >
                {active.direction}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 text-center font-mono text-xs tabular-nums">
              <div className="surface-well rounded-lg border border-white/5 bg-[#0a0b0c] p-2">
                <span className="text-fg-subtle block text-[10px]">ENTRY</span>
                <span className="text-fg font-bold">{active.entry}</span>
              </div>
              <div className="surface-well rounded-lg border border-white/5 bg-[#0a0b0c] p-2">
                <span className="text-bear block text-[10px]">INVALIDATION</span>
                <span className="text-bear font-bold">{active.invalidation}</span>
              </div>
              <div className="surface-well rounded-lg border border-white/5 bg-[#0a0b0c] p-2">
                <span className="text-bull block text-[10px]">TARGET ({active.rr})</span>
                <span className="text-bull font-bold">{active.target2}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
