'use client';

// SPDX-License-Identifier: Apache-2.0

// Self-contained Bento card and bespoke 1px SVG schematic for each of the 4
// specialist AI desks (Macro, Technical, Risk, Sentiment). Replaces nested
// text explanations and sample-question lists with visual instrumentation.
import { m } from 'motion/react';

import { cn } from '@/lib/formatters/cn';

import type { DeskSchematicKind, DeskSpec } from './desks';

interface DeskConsoleProps {
  desk: DeskSpec;
  isSelected: boolean;
  onSelect: () => void;
}

function DeskSchematicSvg({ kind }: { kind: DeskSchematicKind }) {
  if (kind === 'macro') {
    return (
      <svg
        viewBox="0 0 380 132"
        className="h-auto w-full select-none"
        role="img"
        aria-label="Inverse correlation between US 10Y real yields and XAU/USD price"
      >
        <defs>
          <pattern id="desk-grid-macro" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(255,255,255,0.035)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="380" height="132" fill="url(#desk-grid-macro)" />

        {/* Central CPI/FOMC Catalyst Line */}
        <line x1="196" y1="12" x2="196" y2="118" stroke="rgba(255,54,22,0.45)" strokeDasharray="3 3" />
        <rect x="148" y="10" width="96" height="16" rx="4" fill="#1b1312" stroke="rgba(255,54,22,0.4)" />
        <text x="196" y="21" textAnchor="middle" fill="#ff3616" fontSize="8.5" fontWeight="700" className="font-mono">
          US10Y -4.2 BPS
        </text>

        {/* Falling Real Yield Curve (Amber Dashed) */}
        <path
          d="M 18 38 C 78 40, 136 46, 196 68 C 254 88, 308 100, 362 108"
          fill="none"
          stroke="#f5a623"
          strokeWidth="1.75"
          strokeDasharray="4 4"
        />
        <circle cx="362" cy="108" r="3.5" fill="#f5a623" />
        <text x="354" y="122" textAnchor="end" fill="#f5a623" fontSize="8.5" fontWeight="700" className="font-mono">
          US10Y 4.28% ▼
        </text>

        {/* Rising Gold Impulse Curve (Emerald Solid) */}
        <path
          d="M 18 104 C 78 100, 136 92, 196 68 C 254 44, 308 32, 362 24"
          fill="none"
          stroke="#3f9e3d"
          strokeWidth="2.2"
        />
        <circle cx="362" cy="24" r="4" fill="#3f9e3d" />
        <text x="354" y="17" textAnchor="end" fill="#3f9e3d" fontSize="8.5" fontWeight="700" className="font-mono">
          XAU/USD ▲ +1.42%
        </text>

        {/* Crossover Node */}
        <circle cx="196" cy="68" r="4.5" fill="#ff3616" stroke="#0b0c0e" strokeWidth="1.5" />
      </svg>
    );
  }

  if (kind === 'technical') {
    return (
      <svg
        viewBox="0 0 380 132"
        className="h-auto w-full select-none"
        role="img"
        aria-label="Multi-timeframe liquidity sweep and EMA structure schematic"
      >
        <defs>
          <pattern id="desk-grid-tech" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(255,255,255,0.035)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="380" height="132" fill="url(#desk-grid-tech)" />

        {/* PDH Target Horizon */}
        <line x1="16" y1="24" x2="364" y2="24" stroke="#3f9e3d" strokeWidth="1" strokeDasharray="4 3" />
        <text x="360" y="18" textAnchor="end" fill="#3f9e3d" fontSize="8.5" fontWeight="700" className="font-mono">
          PDH TARGET · 2,884.00
        </text>

        {/* Asian Low Sweep Horizon */}
        <line x1="16" y1="98" x2="364" y2="98" stroke="rgba(255,255,255,0.22)" strokeWidth="1" strokeDasharray="2 3" />
        <text x="20" y="92" fill="rgba(255,255,255,0.45)" fontSize="8.5" className="font-mono">
          ASIAN LOW · 2,846.50
        </text>

        {/* 4H EMA 50 Dynamic Support Curve */}
        <path
          d="M 18 86 C 110 84, 210 72, 362 52"
          fill="none"
          stroke="rgba(255,54,22,0.55)"
          strokeWidth="1.5"
        />

        {/* Structural Price Action: Sweep -> Reclaim -> Markup */}
        <path
          d="M 22 74 L 68 82 L 112 114 L 154 76 L 204 82 L 262 50 L 304 58 L 358 26"
          fill="none"
          stroke="#f3f2ee"
          strokeWidth="2"
          strokeLinejoin="round"
        />

        {/* Liquidity Sweep Marker */}
        <circle cx="112" cy="114" r="4" fill="#ff3616" />
        <text x="122" y="120" fill="#ff3616" fontSize="8.5" fontWeight="700" className="font-mono">
          SWEEP &amp; RECLAIM
        </text>

        {/* Active Breakout Node */}
        <circle cx="358" cy="26" r="4" fill="#3f9e3d" />
      </svg>
    );
  }

  if (kind === 'risk') {
    return (
      <svg
        viewBox="0 0 380 132"
        className="h-auto w-full select-none"
        role="img"
        aria-label="1 percent maximum equity risk caliper and asymmetric reward ratio"
      >
        {/* Top Track: Equity Risk Caliper */}
        <text x="18" y="24" fill="rgba(255,255,255,0.5)" fontSize="8.5" className="font-mono">
          EQUITY AT RISK CALIPER
        </text>
        <text x="362" y="24" textAnchor="end" fill="#ff3616" fontSize="8.5" fontWeight="700" className="font-mono">
          HARD VETO CAP · 1.00%
        </text>

        <rect x="18" y="32" width="344" height="22" rx="5" fill="#121417" stroke="rgba(255,255,255,0.09)" />
        {/* Safe Allocation Fill (0.85% of 1.25% scale) */}
        <rect x="20" y="34" width="224" height="18" rx="3.5" fill="rgba(63,158,61,0.28)" stroke="#3f9e3d" />
        <text x="30" y="46" fill="#f3f2ee" fontSize="9.5" fontWeight="700" className="font-mono">
          ALLOCATED: 0.85% EQUITY
        </text>

        {/* Veto Zone Hatching (> 1.00%) */}
        <line x1="276" y1="26" x2="276" y2="60" stroke="#ff3616" strokeWidth="2" />
        <rect x="278" y="34" width="82" height="18" rx="3" fill="rgba(229,72,77,0.16)" />
        <text x="319" y="46" textAnchor="middle" fill="#e5484d" fontSize="8.5" fontWeight="700" className="font-mono">
          VETO ZONE
        </text>

        {/* Bottom Track: Asymmetric 1R vs 3.22R Payoff Bar */}
        <text x="18" y="82" fill="rgba(255,255,255,0.5)" fontSize="8.5" className="font-mono">
          STOP DISTANCE vs. TARGET RUNWAY
        </text>
        <text x="362" y="82" textAnchor="end" fill="#3f9e3d" fontSize="8.5" fontWeight="700" className="font-mono">
          ASYMMETRY · 1 : 3.22 R:R
        </text>

        {/* -1R Risk Block */}
        <rect x="18" y="90" width="78" height="22" rx="4" fill="rgba(229,72,77,0.2)" stroke="#e5484d" />
        <text x="57" y="104" textAnchor="middle" fill="#e5484d" fontSize="9" fontWeight="700" className="font-mono">
          -1.0R STOP
        </text>

        {/* +3.22R Reward Block */}
        <rect x="102" y="90" width="260" height="22" rx="4" fill="rgba(63,158,61,0.22)" stroke="#3f9e3d" />
        <text x="232" y="104" textAnchor="middle" fill="#3f9e3d" fontSize="9" fontWeight="700" className="font-mono">
          +3.22R VERIFIED TARGET RUNWAY
        </text>
      </svg>
    );
  }

  // kind === 'sentiment'
  return (
    <svg
      viewBox="0 0 380 132"
      className="h-auto w-full select-none"
      role="img"
      aria-label="CFTC institutional positioning versus retail crowd sentiment divergence"
    >
      {/* Center Zero Meridian */}
      <line x1="190" y1="14" x2="190" y2="118" stroke="rgba(255,255,255,0.18)" strokeDasharray="3 3" />
      <text x="190" y="11" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="8" className="font-mono">
        NEUTRAL MERIDIAN
      </text>

      {/* Row 1: CFTC Managed Money Net Long */}
      <text x="18" y="34" fill="rgba(255,255,255,0.55)" fontSize="8.5" className="font-mono">
        CFTC MANAGED MONEY
      </text>
      <text x="362" y="34" textAnchor="end" fill="#3f9e3d" fontSize="8.5" fontWeight="700" className="font-mono">
        +18,420 CONTRACTS (74TH %ILE)
      </text>
      <rect x="18" y="40" width="344" height="20" rx="4" fill="#121417" stroke="rgba(255,255,255,0.08)" />
      <rect x="190" y="42" width="152" height="16" rx="3" fill="rgba(63,158,61,0.3)" stroke="#3f9e3d" />
      <text x="266" y="53" textAnchor="middle" fill="#f3f2ee" fontSize="8.5" fontWeight="700" className="font-mono">
        INSTITUTIONAL LONG FLOW →
      </text>

      {/* Row 2: Retail Crowd Net Short (Contrarian Fuel) */}
      <text x="18" y="84" fill="rgba(255,255,255,0.55)" fontSize="8.5" className="font-mono">
        RETAIL CROWD BIAS
      </text>
      <text x="362" y="84" textAnchor="end" fill="#ff3616" fontSize="8.5" fontWeight="700" className="font-mono">
        64% SHORT · CONTRARIAN LONG SIGNAL
      </text>
      <rect x="18" y="90" width="344" height="20" rx="4" fill="#121417" stroke="rgba(255,255,255,0.08)" />
      <rect x="64" y="92" width="126" height="16" rx="3" fill="rgba(255,54,22,0.24)" stroke="#ff3616" />
      <text x="127" y="103" textAnchor="middle" fill="#f3f2ee" fontSize="8.5" fontWeight="700" className="font-mono">
        ← CROWDED SHORT
      </text>
    </svg>
  );
}

export function DeskConsole({ desk, isSelected, onSelect }: DeskConsoleProps) {
  const toneClass =
    desk.biasTone === 'bull'
      ? 'border-bull/35 bg-bull/10 text-bull'
      : desk.biasTone === 'brand'
        ? 'border-brand/35 bg-brand/10 text-brand'
        : 'border-warn/35 bg-warn/10 text-warn';

  return (
    <m.article
      layout
      onClick={onSelect}
      className={cn(
        'group relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-2xl border bg-[#141517]/95 p-5 transition-colors duration-200 sm:p-6',
        isSelected
          ? 'border-brand/45 shadow-[0_20px_50px_-20px_rgba(255,54,22,0.22),inset_0_1px_0_rgba(255,255,255,0.12)]'
          : 'border-white/[0.08] hover:border-white/20',
      )}
    >
      {/* Top Hardware Tag & Live Conviction Pill */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] pb-3.5">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              'flex size-7 items-center justify-center rounded-md border font-mono text-xs font-bold transition-colors',
              isSelected
                ? 'border-brand/40 bg-brand/15 text-brand'
                : 'border-white/10 bg-white/[0.03] text-fg-subtle group-hover:text-fg',
            )}
          >
            {desk.index}
          </span>
          <div>
            <div className="text-fg font-mono text-xs font-bold tracking-wider uppercase">
              {desk.code}
            </div>
            <div className="text-fg-subtle font-mono text-[10px] tracking-wider uppercase">
              {desk.badge}
            </div>
          </div>
        </div>

        <span
          className={cn(
            'rounded border px-2.5 py-1 font-mono text-[11px] font-bold tracking-wider tabular-nums uppercase',
            toneClass,
          )}
        >
          {desk.bias} · {desk.confidence}%
        </span>
      </div>

      {/* Centerpiece Bespoke 1px SVG Schematic */}
      <div className="my-4 overflow-hidden rounded-xl border border-white/[0.07] bg-[#090a0c] p-2">
        <DeskSchematicSvg kind={desk.id} />
      </div>

      {/* Distilled Title + Single-Sentence Copy + 3 Tabular Metric Chips */}
      <div>
        <h3 className="font-display text-fg text-xl font-normal tracking-tight sm:text-2xl">
          {desk.name}
        </h3>
        <p className="text-fg-muted mt-1.5 font-sans text-sm leading-relaxed">{desk.summary}</p>

        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/[0.07] pt-3.5 font-mono">
          {desk.metrics.map((metric) => (
            <div
              key={metric.label}
              className="rounded-lg border border-white/[0.05] bg-[#0b0c0e] px-2.5 py-2"
            >
              <span className="text-fg-subtle block truncate text-[10px] uppercase">
                {metric.label}
              </span>
              <span className="text-fg mt-0.5 block truncate text-xs font-semibold tabular-nums">
                {metric.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </m.article>
  );
}
