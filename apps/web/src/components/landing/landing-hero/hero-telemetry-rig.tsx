'use client';

// SPDX-License-Identifier: Apache-2.0

// Right column of the landing hero: the interactive hardware telemetry rig
// framed by the Horus & Obelisk 3-layer blueprint engravings, with an
// interactive viewport toggle (3-Layer Sovereign Plate vs 3D Hologram), a
// 4-desk consensus matrix, and the committee trade plan.
import { IconBolt, IconCube, IconStack2 } from '@tabler/icons-react';
import { m } from 'motion/react';
import dynamic from 'next/dynamic';
import { useState } from 'react';

import { BlueprintPlate, type BlueprintPlateId } from '@/components/brand/blueprint-plates';
import { cn } from '@/lib/formatters/cn';

import { SYMBOLS, type DeskBias } from './telemetry';

const Landing3DHologram = dynamic(
  () => import('@/components/landing/landing-3d-hologram').then((m) => m.Landing3DHologram),
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

const SYMBOL_PLATES: readonly BlueprintPlateId[] = ['horus', 'obelisk', 'arbiter'];

export function HeroTelemetryRig({ activeSymbolIndex, onSelectSymbol }: HeroTelemetryRigProps) {
  const [viewportMode, setViewportMode] = useState<'plate' | 'hologram'>('plate');
  const active = SYMBOLS[activeSymbolIndex] ?? SYMBOLS[0]!;
  const activePlateId = SYMBOL_PLATES[activeSymbolIndex % SYMBOL_PLATES.length] ?? 'horus';

  const desks = [
    { code: 'DESK-I', label: 'HORUS', read: active.macroSignal, bias: active.macroBias },
    { code: 'DESK-II', label: 'ASTROLABE', read: active.techSignal, bias: active.techBias },
    { code: 'DESK-III', label: 'AEGIS', read: active.riskSignal, bias: active.riskBias },
    {
      code: 'DESK-IV',
      label: 'SENTINEL',
      read: active.sentimentSignal,
      bias: active.sentimentBias,
    },
  ] as const;

  return (
    <div className="relative lg:col-span-5">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-6 z-0 opacity-75 sm:-inset-10"
      >
        <BlueprintPlate id={activePlateId} showRasterBackup className="h-full w-full" />
      </div>

      <div className="surface-panel relative z-10 overflow-hidden rounded-2xl border border-white/15 bg-[#141516]/95 p-4 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.12)] sm:p-6">
        {/* Header Status & Symbol Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3.5">
          <div className="flex items-center gap-2">
            <span className="bg-bull size-2 rounded-full" />
            <span className="text-fg font-mono text-xs font-bold tracking-wider uppercase">
              COMMITTEE BRIEFING
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
          <div className="surface-well my-3.5 rounded-xl border border-white/5 bg-[#0b0c0d] p-3.5 sm:p-4">
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
              <div className="text-fg font-mono text-2xl font-bold tracking-tight tabular-nums sm:text-4xl">
                {active.price}
              </div>
              <span className="text-fg-subtle font-mono text-[11px]">Spread: {active.spread}</span>
            </div>
          </div>

          {/* ── Sovereign 3-Layer Brand Plate + 3D Hologram Dual Viewport ── */}
          <div className="my-3 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-fg-subtle font-mono text-[9px] tracking-[0.16em] uppercase">
                SOVEREIGN VISUAL ENGINE
              </span>
              <div className="flex items-center gap-1 rounded-md border border-white/10 bg-black/50 p-0.5">
                <button
                  type="button"
                  onClick={() => setViewportMode('plate')}
                  className={cn(
                    'inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[9px] font-semibold tracking-wider uppercase transition-colors',
                    viewportMode === 'plate'
                      ? 'bg-brand text-white'
                      : 'text-fg-subtle hover:text-fg',
                  )}
                >
                  <IconStack2 className="size-3" />
                  3-Layer Plate
                </button>
                <button
                  type="button"
                  onClick={() => setViewportMode('hologram')}
                  className={cn(
                    'inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[9px] font-semibold tracking-wider uppercase transition-colors',
                    viewportMode === 'hologram'
                      ? 'bg-brand text-white'
                      : 'text-fg-subtle hover:text-fg',
                  )}
                >
                  <IconCube className="size-3" />
                  3D Hologram
                </button>
              </div>
            </div>

            {viewportMode === 'plate' ? (
              <BlueprintPlate
                id={activePlateId}
                variant="showcase"
                showRasterBackup
                allowLayerToggle
                className="h-[236px] w-full sm:h-[248px]"
              />
            ) : (
              <div className="relative flex h-[236px] w-full items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/60 shadow-inner sm:h-[248px]">
                <div className="text-fg-subtle absolute top-2.5 left-3 z-10 flex items-center gap-2 font-mono text-[9px] select-none">
                  <span className="bg-brand size-1.5 rounded-full" />
                  <span>MULTI-DESK CONSENSUS ENGINE</span>
                </div>
                <div className="text-brand/80 pointer-events-none absolute right-3 bottom-2 z-10 font-mono text-[9px] select-none">
                  DRAG TO INSPECT
                </div>
                <Landing3DHologram className="h-full w-full" />
              </div>
            )}
          </div>

          {/* 4-Desk Live Consensus Matrix */}
          <div className="border-y border-white/[0.07]">
            <div className="text-fg-subtle flex items-center justify-between py-1.5 font-mono text-[9px] tracking-[0.18em] uppercase">
              <span>4-Desk Consensus Matrix</span>
              <span className="text-fg-subtle/70 tabular-nums">{active.conviction}%</span>
            </div>
            <div className="divide-y divide-white/[0.06]">
              {desks.map((desk) => (
                <div
                  key={desk.code}
                  className="grid grid-cols-[52px_1fr_auto] items-center gap-2 py-1.5"
                >
                  <span className="text-fg-subtle font-mono text-[9px] tracking-wider">
                    {desk.code}
                  </span>
                  <span className="text-fg-muted truncate font-mono text-[10px]">
                    <span className="text-fg/80 font-semibold">{desk.label}</span>
                    <span className="text-fg-subtle/60 mx-1">·</span>
                    {desk.read}
                  </span>
                  <span
                    className={cn(
                      'rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider',
                      BIAS_STYLES[desk.bias],
                    )}
                  >
                    {desk.bias}
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
            <p className="text-fg-subtle mt-2 flex items-center gap-1.5 font-mono text-[9px]">
              <IconBolt className="text-brand size-3" />
              ILLUSTRATIVE COMMITTEE OUTPUT · NOT A LIVE SIGNAL
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
