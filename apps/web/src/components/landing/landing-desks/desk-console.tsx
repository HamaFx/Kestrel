'use client';

// SPDX-License-Identifier: Apache-2.0

// Open architectural column for each specialist desk in #desks, featuring a
// pure geometric 1px optical SVG graphic (zero flowchart text boxes), concise
// copy, and hairline-separated metrics.
import type { DeskSchematicKind, DeskSpec } from './desks';

interface DeskConsoleProps {
  desk: DeskSpec;
}

function DeskOpticalSvg({ kind }: { kind: DeskSchematicKind }) {
  if (kind === 'macro') {
    return (
      <svg
        viewBox="0 0 240 92"
        className="h-24 w-full select-none"
         aria-hidden="true"
      >
        <defs>
          <linearGradient id="macro-opt-glow" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(63,158,61,0.02)" />
            <stop offset="50%" stopColor="rgba(255,54,22,0.16)" />
            <stop offset="100%" stopColor="rgba(63,158,61,0.22)" />
          </linearGradient>
        </defs>
        <line x1="0" y1="46" x2="240" y2="46" stroke="rgba(255,255,255,0.07)" />
        <line x1="120" y1="8" x2="120" y2="84" stroke="rgba(255,54,22,0.3)" strokeDasharray="2 3" />
        <path
          d="M 0 22 C 48 24, 84 34, 120 46 C 156 58, 192 68, 240 72"
          fill="none"
          stroke="rgba(217,143,0,0.65)"
          strokeWidth="1.5"
          strokeDasharray="3 3"
        />
        <path
          d="M 0 72 C 48 68, 84 58, 120 46 C 156 34, 192 22, 240 16 L 240 46 L 0 46 Z"
          fill="url(#macro-opt-glow)"
        />
        <path
          d="M 0 72 C 48 68, 84 58, 120 46 C 156 34, 192 22, 240 16"
          fill="none"
          stroke="#3f9e3d"
          strokeWidth="1.75"
        />
        <circle cx="120" cy="46" r="3.5" fill="#ff3616" />
        <circle cx="236" cy="16" r="3" fill="#3f9e3d" />
      </svg>
    );
  }

  if (kind === 'technical') {
    return (
      <svg
        viewBox="0 0 240 92"
        className="h-24 w-full select-none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="tech-opt-wash" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(63,158,61,0.22)" />
            <stop offset="100%" stopColor="rgba(18,18,18,0)" />
          </linearGradient>
        </defs>
        <line x1="0" y1="20" x2="240" y2="20" stroke="rgba(63,158,61,0.35)" strokeDasharray="3 4" />
        <line x1="0" y1="68" x2="240" y2="68" stroke="rgba(255,255,255,0.12)" strokeDasharray="2 4" />
        <path
          d="M 0 56 L 38 60 L 72 80 L 106 52 L 144 58 L 188 34 L 240 18 L 240 92 L 0 92 Z"
          fill="url(#tech-opt-wash)"
        />
        <path
          d="M 0 64 C 68 62, 140 52, 240 36"
          fill="none"
          stroke="rgba(255,54,22,0.5)"
          strokeWidth="1.25"
        />
        <path
          d="M 0 56 L 38 60 L 72 80 L 106 52 L 144 58 L 188 34 L 240 18"
          fill="none"
          stroke="#e5e5e5"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
        <circle cx="72" cy="80" r="3.5" fill="#ff3616" />
        <circle cx="236" cy="19" r="3.5" fill="#3f9e3d" />
      </svg>
    );
  }

  if (kind === 'risk') {
    return (
      <svg
        viewBox="0 0 240 92"
        className="h-24 w-full select-none"
        aria-hidden="true"
      >
        {/* Semicircular Caliper Arc */}
        <path
          d="M 48 76 A 72 72 0 0 1 192 76"
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M 48 76 A 72 72 0 0 1 154 13"
          fill="none"
          stroke="#3f9e3d"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M 162 17 A 72 72 0 0 1 192 76"
          fill="none"
          stroke="rgba(240,62,62,0.45)"
          strokeWidth="4"
          strokeLinecap="round"
        />
        {/* 1.0% Hard Limit Radial Marker & Needle */}
        <line x1="120" y1="76" x2="154" y2="14" stroke="#e5e5e5" strokeWidth="1.5" />
        <circle cx="154" cy="14" r="3.5" fill="#ff3616" />
        <circle cx="120" cy="76" r="4" fill="#e5e5e5" />
      </svg>
    );
  }

  // kind === 'sentiment'
  return (
    <svg
      viewBox="0 0 240 92"
      className="h-24 w-full select-none"
      aria-hidden="true"
    >
      <line x1="120" y1="8" x2="120" y2="84" stroke="rgba(255,255,255,0.14)" strokeDasharray="2 3" />
      {[18, 36, 54, 72].map((y, idx) => {
        const rightW = [42, 68, 88, 62][idx]!;
        const leftW = [54, 38, 28, 46][idx]!;
        return (
          <g key={y}>
            <line
              x1={120 - leftW}
              y1={y}
              x2="116"
              y2={y}
              stroke="rgba(255,54,22,0.45)"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <line
              x1="124"
              y1={y}
              x2={120 + rightW}
              y2={y}
              stroke="#3f9e3d"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </g>
        );
      })}
      <circle cx="208" cy="54" r="3.5" fill="#3f9e3d" />
    </svg>
  );
}

export function DeskConsole({ desk }: DeskConsoleProps) {
  return (
    <article className="group flex flex-col justify-between p-7 transition-colors duration-200 hover:bg-white/[0.015] sm:p-9">
      <div>
        {/* Minimalist Index & Conviction Header */}
        <div className="flex items-center justify-between font-mono text-xs">
          <span className="text-brand font-bold tracking-wider">{desk.index} // {desk.code}</span>
          <span className="text-fg-subtle tabular-nums">{desk.confidence}%</span>
        </div>

        {/* Pure Optical SVG Illustration */}
        <div className="my-7 border-y border-white/[0.05] py-3">
          <DeskOpticalSvg kind={desk.id} />
        </div>

        {/* Title & Single-Sentence Copy */}
        <h3 className="font-display text-fg text-2xl font-normal tracking-tight">
          {desk.name}
        </h3>
        <p className="text-fg-muted mt-2.5 font-sans text-sm leading-relaxed">
          {desk.summary}
        </p>
      </div>

      {/* Unboxed Hairline Spec Rows */}
      <div className="mt-8 divide-y divide-white/[0.06] border-t border-white/[0.08] font-mono text-xs">
        {desk.metrics.map((metric) => (
          <div key={metric.label} className="flex items-center justify-between py-2.5">
            <span className="text-fg-subtle text-[11px] uppercase">{metric.label}</span>
            <span className="text-fg font-semibold tabular-nums">{metric.value}</span>
          </div>
        ))}
      </div>
    </article>
  );
}
