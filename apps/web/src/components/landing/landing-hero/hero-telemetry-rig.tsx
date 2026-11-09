'use client';

// SPDX-License-Identifier: Apache-2.0

// Right column of the landing hero: kinetic 4-Desk SVG Convergence & Price
// Trajectory schematic replacing multi-box text clutter with live vector
// signal paths, a 4/4 numeric verifier gate, and an entry/stop/target band plot.
import { m } from 'motion/react';

import { cn } from '@/lib/formatters/cn';

import { SYMBOLS, type DeskBias } from './telemetry';

interface HeroTelemetryRigProps {
  activeSymbolIndex: number;
  onSelectSymbol: (index: number) => void;
}

const BIAS_COLOR: Record<DeskBias, { stroke: string; badge: string; dot: string }> = {
  BULL: {
    stroke: '#3f9e3d',
    badge: 'border-bull/35 bg-bull/10 text-bull',
    dot: '#3f9e3d',
  },
  BEAR: {
    stroke: '#e5484d',
    badge: 'border-bear/35 bg-bear/10 text-bear',
    dot: '#e5484d',
  },
  GUARD: {
    stroke: '#f5a623',
    badge: 'border-warn/35 bg-warn/10 text-warn',
    dot: '#f5a623',
  },
};

export function HeroTelemetryRig({ activeSymbolIndex, onSelectSymbol }: HeroTelemetryRigProps) {
  const active = SYMBOLS[activeSymbolIndex] ?? SYMBOLS[0]!;
  const isLong = active.direction.startsWith('BUY');

  const desks = [
    { id: '01', code: 'MACRO', bias: active.macroBias, y: 34 },
    { id: '02', code: 'TECH', bias: active.techBias, y: 86 },
    { id: '03', code: 'RISK', bias: active.riskBias, y: 138 },
    { id: '04', code: 'COT', bias: active.sentimentBias, y: 190 },
  ] as const;

  // Trajectory curve coordinates flip smoothly between LONG and SHORT setups
  const priceCurve = isLong
    ? 'M 268 164 C 286 172, 300 144, 318 148 C 334 152, 344 126, 362 126'
    : 'M 268 62 C 286 54, 300 84, 318 78 C 334 74, 344 100, 362 100';
  const projectedCurve = isLong
    ? 'M 362 126 C 384 122, 404 72, 438 46'
    : 'M 362 100 C 384 104, 404 152, 438 178';
  const entryY = isLong ? 126 : 100;
  const targetY = isLong ? 46 : 178;
  const stopY = isLong ? 182 : 44;

  return (
    <div className="relative lg:col-span-6">
      <div className="surface-panel relative z-10 overflow-hidden rounded-2xl border border-white/12 bg-[#141517]/95 p-4 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.1)] sm:p-5">
        {/* Top Hardware Header & Symbol Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-3">
          <div className="flex items-center gap-2">
            <span className="bg-bull size-2 rounded-full shadow-[0_0_8px_#3f9e3d]" />
            <span className="text-fg font-mono text-[11px] font-bold tracking-[0.12em] uppercase">
              FIG 0.1 · 4-DESK FUSION SCHEMATIC
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

        {/* Instrument Ticker Header */}
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-white/[0.06] bg-[#0b0c0e] px-3.5 py-2.5">
          <div className="flex items-baseline gap-2.5">
            <span className="text-fg font-mono text-xl font-bold tracking-tight tabular-nums sm:text-2xl">
              {active.price}
            </span>
            <span className="text-fg-subtle font-mono text-xs">{active.symbol}</span>
          </div>
          <div className="flex items-center gap-2.5 font-mono text-xs">
            <span className={cn('font-semibold tabular-nums', active.isPositive ? 'text-bull' : 'text-bear')}>
              {active.isPositive ? '▲' : '▼'} {active.change}
            </span>
            <span className="border-brand/30 bg-brand/10 text-brand rounded border px-2 py-0.5 text-[11px] font-bold tabular-nums">
              {active.conviction}% VERIFIED
            </span>
          </div>
        </div>

        {/* Centerpiece Kinetic SVG: 4 Desks -> 4/4 Verifier Gate -> Live Setup Band Plot */}
        <div className="my-3 overflow-hidden rounded-xl border border-white/[0.07] bg-[#090a0c] p-2">
          <svg
            viewBox="0 0 460 224"
            className="h-auto w-full select-none"
            role="img"
            aria-label={`${active.symbol} 4-desk convergence and price setup schematic`}
          >
            <defs>
              <pattern id="hero-schematic-grid" width="22" height="22" patternUnits="userSpaceOnUse">
                <path
                  d="M 22 0 L 0 0 0 22"
                  fill="none"
                  stroke="rgba(255,255,255,0.035)"
                  strokeWidth="1"
                />
              </pattern>
              <linearGradient id="hero-trace-ember" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(255,255,255,0.16)" />
                <stop offset="55%" stopColor="rgba(255,54,22,0.65)" />
                <stop offset="100%" stopColor="#ff3616" />
              </linearGradient>
            </defs>

            <rect width="460" height="224" fill="url(#hero-schematic-grid)" />

            {/* Zone Divider Hairlines */}
            <line x1="138" y1="10" x2="138" y2="214" stroke="rgba(255,255,255,0.06)" strokeDasharray="2 3" />
            <line x1="258" y1="10" x2="258" y2="214" stroke="rgba(255,255,255,0.06)" strokeDasharray="2 3" />

            {/* Column Captions */}
            <text x="12" y="14" fill="rgba(255,255,255,0.38)" fontSize="8.5" className="font-mono">
              SPECIALIST DESKS
            </text>
            <text x="198" y="14" textAnchor="middle" fill="rgba(255,255,255,0.38)" fontSize="8.5" className="font-mono">
              ARBITER GATE
            </text>
            <text x="268" y="14" fill="rgba(255,255,255,0.38)" fontSize="8.5" className="font-mono">
              EXECUTION BANDS ({active.rr})
            </text>

            {/* 4 Cubic-Bezier Convergence Signal Traces + Animated Signal Pulses */}
            {desks.map((desk, i) => {
              const pathD = `M 126 ${desk.y} C 166 ${desk.y}, 174 112, 204 112`;
              const tone = BIAS_COLOR[desk.bias];
              return (
                <g key={desk.id}>
                  <path d={pathD} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="1.25" />
                  <m.path
                    d={pathD}
                    fill="none"
                    stroke="url(#hero-trace-ember)"
                    strokeWidth="1.5"
                    strokeDasharray="5 7"
                    initial={{ strokeDashoffset: 24 }}
                    animate={{ strokeDashoffset: 0 }}
                    transition={{
                      duration: 1.8 + i * 0.2,
                      repeat: Infinity,
                      ease: 'linear',
                    }}
                  />
                  {/* Desk Node Pill */}
                  <rect
                    x="10"
                    y={desk.y - 14}
                    width="116"
                    height="28"
                    rx="6"
                    fill="#121316"
                    stroke="rgba(255,255,255,0.1)"
                    strokeWidth="1"
                  />
                  <circle cx="22" cy={desk.y} r="3.2" fill={tone.dot} />
                  <text
                    x="31"
                    y={desk.y + 3.5}
                    fill="#f3f2ee"
                    fontSize="10"
                    fontWeight="700"
                    className="font-mono"
                  >
                    {desk.code}
                  </text>
                  <text
                    x="118"
                    y={desk.y + 3.5}
                    textAnchor="end"
                    fill={tone.dot}
                    fontSize="9"
                    fontWeight="700"
                    className="font-mono"
                  >
                    {desk.bias}
                  </text>
                </g>
              );
            })}

            {/* Central 4/4 Numeric Verifier Gate */}
            <g transform="translate(218, 112)">
              <m.circle
                r="24"
                fill="none"
                stroke="rgba(255,54,22,0.28)"
                strokeWidth="1"
                animate={{ scale: [1, 1.14, 1], opacity: [0.65, 0.2, 0.65] }}
                transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
              />
              <polygon
                points="0,-20 20,0 0,20 -20,0"
                fill="#181212"
                stroke="#ff3616"
                strokeWidth="1.5"
              />
              <text
                x="0"
                y="-1"
                textAnchor="middle"
                fill="#ff3616"
                fontSize="9"
                fontWeight="700"
                className="font-mono"
              >
                4/4
              </text>
              <text
                x="0"
                y="9"
                textAnchor="middle"
                fill="#f3f2ee"
                fontSize="7.5"
                className="font-mono"
              >
                GATE
              </text>
            </g>

            {/* Connector from Verifier Gate into Price Entry Horizon */}
            <path
              d={`M 238 112 C 250 112, 254 ${entryY}, 268 ${entryY}`}
              fill="none"
              stroke="#ff3616"
              strokeWidth="1.5"
            />

            {/* Right Zone: Price Setup Bands (Reward Zone + Stop Zone) */}
            <rect
              x="268"
              y={Math.min(entryY, targetY)}
              width="178"
              height={Math.abs(entryY - targetY)}
              fill="rgba(63,158,61,0.11)"
            />
            <rect
              x="268"
              y={Math.min(entryY, stopY)}
              width="178"
              height={Math.abs(stopY - entryY)}
              fill="rgba(229,72,77,0.12)"
            />

            {/* Target, Entry, and Stop Horizon Lines */}
            <line
              x1="268"
              y1={targetY}
              x2="446"
              y2={targetY}
              stroke="#3f9e3d"
              strokeWidth="1.2"
              strokeDasharray="4 3"
            />
            <line
              x1="268"
              y1={entryY}
              x2="446"
              y2={entryY}
              stroke="rgba(255,255,255,0.55)"
              strokeWidth="1.2"
            />
            <line
              x1="268"
              y1={stopY}
              x2="446"
              y2={stopY}
              stroke="#e5484d"
              strokeWidth="1.2"
              strokeDasharray="3 3"
            />

            {/* Band Labels */}
            <text
              x="442"
              y={targetY + (isLong ? 11 : -5)}
              textAnchor="end"
              fill="#3f9e3d"
              fontSize="8.5"
              fontWeight="700"
              className="font-mono"
            >
              TP2 {active.target2}
            </text>
            <text
              x="442"
              y={entryY - 5}
              textAnchor="end"
              fill="#f3f2ee"
              fontSize="8.5"
              fontWeight="700"
              className="font-mono"
            >
              ENTRY {active.entry}
            </text>
            <text
              x="442"
              y={stopY + (isLong ? -5 : 11)}
              textAnchor="end"
              fill="#e5484d"
              fontSize="8.5"
              fontWeight="700"
              className="font-mono"
            >
              SL {active.invalidation}
            </text>

            {/* Historical Price Path + Projected Target Trajectory */}
            <path d={priceCurve} fill="none" stroke="#f3f2ee" strokeWidth="2" strokeLinecap="round" />
            <path
              d={projectedCurve}
              fill="none"
              stroke={isLong ? '#3f9e3d' : '#e5484d'}
              strokeWidth="2"
              strokeDasharray="4 4"
              strokeLinecap="round"
            />

            {/* Active Entry Node & Target Node */}
            <circle cx="362" cy={entryY} r="4" fill="#ff3616" stroke="#121212" strokeWidth="1.5" />
            <circle
              cx="438"
              cy={targetY}
              r="3.5"
              fill={isLong ? '#3f9e3d' : '#e5484d'}
              stroke="#121212"
              strokeWidth="1.5"
            />
          </svg>
        </div>

        {/* Crisp 4-Cell Tabular Execution Footer */}
        <div className="grid grid-cols-2 gap-2 font-mono text-xs tabular-nums sm:grid-cols-4">
          <div className="rounded-lg border border-white/[0.06] bg-[#0b0c0e] px-3 py-2">
            <span className="text-fg-subtle block text-[10px] uppercase">DIRECTION</span>
            <span className={cn('font-bold', isLong ? 'text-bull' : 'text-bear')}>
              {active.direction}
            </span>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-[#0b0c0e] px-3 py-2">
            <span className="text-fg-subtle block text-[10px] uppercase">ENTRY</span>
            <span className="text-fg font-bold">{active.entry}</span>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-[#0b0c0e] px-3 py-2">
            <span className="text-fg-subtle block text-[10px] uppercase">STOP ({active.riskSize})</span>
            <span className="text-bear font-bold">{active.invalidation}</span>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-[#0b0c0e] px-3 py-2">
            <span className="text-fg-subtle block text-[10px] uppercase">TARGET ({active.rr})</span>
            <span className="text-bull font-bold">{active.target2}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
