'use client';

// SPDX-License-Identifier: Apache-2.0

// Right column of the landing hero: clean live market & trade setup summary
// preview showing price, key support/resistance levels, risk/reward, the 4
// analysis angles (Economy & News, Chart & Price Levels, Risk & Trade Sizing,
// Positioning & Sentiment), and an optional 3D view.
import { IconBolt, IconChartCandle, IconCube } from '@tabler/icons-react';
import { m } from 'motion/react';
import dynamic from 'next/dynamic';
import { useState } from 'react';

import { cn } from '@/lib/formatters/cn';

import { SYMBOLS, type DeskBias } from './telemetry';

const Landing3DHologram = dynamic(
  () => import('@/components/landing/landing-3d-hologram').then((mod) => mod.Landing3DHologram),
  { ssr: false },
);

interface HeroTelemetryRigProps {
  activeSymbolIndex: number;
  onSelectSymbol: (index: number) => void;
}

const BIAS_STYLES: Record<DeskBias, string> = {
  BULL: 'border-bull/30 bg-bull/10 text-bull',
  BEAR: 'border-bear/30 bg-bear/10 text-bear',
  GUARD: 'border-warn/30 bg-warn/10 text-warn',
};

export function HeroTelemetryRig({ activeSymbolIndex, onSelectSymbol }: HeroTelemetryRigProps) {
  const [viewportMode, setViewportMode] = useState<'preview' | 'hologram'>('preview');
  const active = SYMBOLS[activeSymbolIndex] ?? SYMBOLS[0]!;

  const analysisAngles = [
    {
      label: 'Economy & News',
      read: active.macroSignal,
      bias: active.macroBias,
    },
    {
      label: 'Chart & Price Levels',
      read: active.techSignal,
      bias: active.techBias,
    },
    {
      label: 'Risk & Trade Sizing',
      read: active.riskSignal,
      bias: active.riskBias,
    },
    {
      label: 'Positioning & Sentiment',
      read: active.sentimentSignal,
      bias: active.sentimentBias,
    },
  ] as const;

  return (
    <div className="relative lg:col-span-5">
      <div className="surface-panel relative z-10 overflow-hidden rounded-2xl border border-white/15 bg-[#141516]/95 p-4 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.12)] sm:p-6">
        {/* Header Status & Symbol Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3.5">
          <div className="flex items-center gap-2">
            <span className="bg-bull size-2 rounded-full" />
            <span className="text-fg font-mono text-xs font-bold tracking-wider uppercase">
              LIVE MARKET & SETUP PREVIEW
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
                    'relative rounded px-2.5 py-1 font-mono text-[11px] font-semibold transition-colors duration-200 active:translate-y-[0.5px]',
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
          <div className="surface-well my-3.5 rounded-xl border border-white/5 bg-[#0b0c0d] p-3.5 sm:p-4">
            <div className="flex items-baseline justify-between gap-2">
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
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <div className="text-fg font-mono text-2xl font-bold tracking-tight tabular-nums sm:text-4xl">
                {active.price}
              </div>
              <div className="text-fg-subtle flex flex-col items-end font-mono text-[11px]">
                <span>Spread: {active.spread}</span>
                <span>{active.atrNote}</span>
              </div>
            </div>
          </div>

          {/* ── Clean Live Market Levels & Risk/Reward Preview + Optional 3D Toggle ── */}
          <div className="my-3 flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-fg-subtle font-mono text-[11px] tracking-wider uppercase">
                {active.sessionLabel}
              </span>
              <div className="flex items-center gap-1 rounded-md border border-white/10 bg-black/50 p-0.5">
                <button
                  type="button"
                  onClick={() => setViewportMode('preview')}
                  className={cn(
                    'inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[11px] font-semibold tracking-wider uppercase transition-colors',
                    viewportMode === 'preview'
                      ? 'bg-brand text-white'
                      : 'text-fg-subtle hover:text-fg',
                  )}
                >
                  <IconChartCandle className="size-3.5" />
                  Key Levels
                </button>
                <button
                  type="button"
                  onClick={() => setViewportMode('hologram')}
                  className={cn(
                    'inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[11px] font-semibold tracking-wider uppercase transition-colors',
                    viewportMode === 'hologram'
                      ? 'bg-brand text-white'
                      : 'text-fg-subtle hover:text-fg',
                  )}
                >
                  <IconCube className="size-3.5" />
                  3D View
                </button>
              </div>
            </div>

            {viewportMode === 'preview' ? (
              <div className="surface-well flex flex-col justify-between gap-3 rounded-xl border border-white/10 bg-[#0b0c0d] p-3.5 sm:p-4">
                {/* Support & Resistance Level Cards */}
                <div className="grid grid-cols-2 gap-2.5 font-mono">
                  <div className="rounded-lg border border-white/5 bg-black/50 p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-fg-subtle text-[11px] uppercase">Key Support</span>
                      <span className="text-bull text-[11px] font-semibold">S1 Floor</span>
                    </div>
                    <div className="text-fg mt-1 text-sm font-bold tabular-nums">
                      {active.supportLevel}
                    </div>
                    <div className="text-fg-muted mt-0.5 font-sans text-[11px]">
                      {active.supportNote}
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/5 bg-black/50 p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-fg-subtle text-[11px] uppercase">Key Resistance</span>
                      <span className="text-brand text-[11px] font-semibold">R1 Ceiling</span>
                    </div>
                    <div className="text-fg mt-1 text-sm font-bold tabular-nums">
                      {active.resistanceLevel}
                    </div>
                    <div className="text-fg-muted mt-0.5 font-sans text-[11px]">
                      {active.resistanceNote}
                    </div>
                  </div>
                </div>

                {/* Visual Range Position Meter */}
                <div className="rounded-lg border border-white/5 bg-black/40 px-3 py-2.5">
                  <div className="mb-1.5 flex items-center justify-between font-mono text-[11px]">
                    <span className="text-bear">SL {active.invalidation}</span>
                    <span className="text-fg font-semibold">Entry {active.entry}</span>
                    <span className="text-bull">TP1 {active.target1}</span>
                  </div>
                  <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/10">
                    <div className="bg-bear/60 absolute inset-y-0 left-0 w-[26%]" />
                    <div className="bg-bull/70 absolute inset-y-0 right-0 left-[26%]" />
                    <div
                      aria-hidden="true"
                      className="absolute top-0 bottom-0 left-[26%] w-1 bg-white shadow-[0_0_6px_#ffffff]"
                    />
                  </div>
                  <div className="text-fg-subtle mt-1.5 flex items-center justify-between font-mono text-[11px]">
                    <span>Risk/Reward: {active.rr}</span>
                    <span>Size: {active.riskSize} (≤ 1.0% Max)</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative flex h-[196px] w-full items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/60 shadow-inner sm:h-[208px]">
                <div className="text-fg-subtle absolute top-2.5 left-3 z-10 flex items-center gap-2 font-mono text-[11px] select-none">
                  <span className="bg-brand size-1.5 rounded-full" />
                  <span>MULTI-ANGLE CONSENSUS ENGINE</span>
                </div>
                <div className="text-brand/80 pointer-events-none absolute right-3 bottom-2 z-10 font-mono text-[11px] select-none">
                  DRAG TO INSPECT
                </div>
                <Landing3DHologram className="h-full w-full" />
              </div>
            )}
          </div>

          {/* 4 Analysis Angles Breakdown */}
          <div className="border-y border-white/[0.07] py-2">
            <div className="text-fg-subtle flex items-center justify-between pb-1.5 font-mono text-[11px] tracking-wider uppercase">
              <span>4 Analysis Angles</span>
              <span className="text-fg font-semibold tabular-nums">
                {active.conviction}% Alignment
              </span>
            </div>
            <div className="divide-y divide-white/[0.06]">
              {analysisAngles.map((angle) => (
                <div
                  key={angle.label}
                  className="grid grid-cols-[1fr_auto] items-center gap-2 py-2"
                >
                  <div className="min-w-0">
                    <div className="text-fg font-sans text-xs font-semibold">{angle.label}</div>
                    <div className="text-fg-muted truncate font-mono text-[11px]">{angle.read}</div>
                  </div>
                  <span
                    className={cn(
                      'rounded border px-2 py-0.5 font-mono text-[11px] font-bold tracking-wider',
                      BIAS_STYLES[angle.bias],
                    )}
                  >
                    {angle.bias}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Consensus Trade Card */}
          <div className="border-brand/30 bg-brand/[0.06] mt-3 rounded-xl border p-3.5 shadow-sm sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-fg font-mono text-xs font-bold uppercase">
                  Trade Setup Summary
                </span>
                <span className="text-brand bg-brand/10 border-brand/20 rounded border px-1.5 py-0.5 font-mono text-[11px]">
                  {active.rr} R:R
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
                <span className="text-fg-subtle block text-[11px]">ENTRY</span>
                <span className="text-fg font-bold">{active.entry}</span>
              </div>
              <div className="surface-well rounded-lg border border-white/5 bg-[#0a0b0c] p-2">
                <span className="text-bear block text-[11px]">STOP LOSS</span>
                <span className="text-bear font-bold">{active.invalidation}</span>
              </div>
              <div className="surface-well rounded-lg border border-white/5 bg-[#0a0b0c] p-2">
                <span className="text-bull block text-[11px]">TARGET ({active.rr})</span>
                <span className="text-bull font-bold">{active.target2}</span>
              </div>
            </div>
            <p className="text-fg-subtle mt-2 flex items-center gap-1.5 font-mono text-[11px]">
              <IconBolt className="text-brand size-3.5" />
              SAMPLE RESEARCH OUTPUT · FOR EDUCATIONAL PREVIEW
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
