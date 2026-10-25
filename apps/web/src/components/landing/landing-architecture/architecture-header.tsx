'use client';

// SPDX-License-Identifier: Apache-2.0

// Section header for the architecture workbench: the dual concentric
// rotating SVG marquee badge and the intro copy.
import { IconLock } from '@tabler/icons-react';

export function ArchitectureHeader() {
  return (
    <div className="mb-20 flex flex-col items-center gap-4 text-center">
      {/* Dual Concentric Circular Rotating SVG Marquee */}
      <div className="relative mb-2 flex size-32 items-center justify-center select-none sm:size-40">
        <svg
          viewBox="0 0 400 400"
          className="text-fg-subtle absolute inset-0 size-full animate-[spin_32s_linear_infinite] font-mono text-[11px] tracking-[0.22em] uppercase opacity-70 motion-reduce:animate-none"
        >
          <defs>
            <path
              id="circle-outer"
              d="M 200 200 m -160 0 a 160 160 0 1 1 320 0 a 160 160 0 1 1 -320 0"
            />
          </defs>
          <text fill="currentColor">
            <textPath href="#circle-outer" startOffset="0%">
              • KESTREL ARCHITECTURE • ZERO CUSTODIAL RISK • 4 AUTONOMOUS DESKS •
            </textPath>
          </text>
        </svg>

        <svg
          viewBox="0 0 400 400"
          className="text-brand absolute inset-0 size-full animate-[spin_24s_linear_infinite_reverse] font-mono text-[10px] tracking-[0.18em] uppercase opacity-85 motion-reduce:animate-none"
        >
          <defs>
            <path
              id="circle-inner"
              d="M 200 200 m -120 0 a 120 120 0 1 1 240 0 a 120 120 0 1 1 -240 0"
            />
          </defs>
          <text fill="currentColor">
            <textPath href="#circle-inner" startOffset="0%">
              • 1.0% VETO FIREWALL • VERIFIED TRADE PLANS •
            </textPath>
          </text>
        </svg>

        <div className="surface-chip text-brand flex size-14 items-center justify-center rounded-full border border-white/20 bg-[#18191a] shadow-[0_0_16px_rgba(255,54,22,0.4)]">
          <IconLock className="text-brand size-6" />
        </div>
      </div>

      <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-xs">
        <span className="bg-brand size-2 animate-pulse rounded-full" />
        <span className="text-brand font-semibold tracking-wider uppercase">
          ※ 4-Layer Intelligence Stack
        </span>
      </div>

      <h2 className="font-display text-fg max-w-2xl text-3xl font-normal tracking-[-0.03em] sm:text-5xl">
        ENGINEERED AS AN{' '}
        <span className="font-redaction-35 text-brand italic">Unbreakable Stack</span>
      </h2>
      <p className="text-fg-muted max-w-xl font-sans text-sm leading-relaxed sm:text-base">
        Every trade setup passes through four independent layers of verification. Hover or tap any
        layer below to inspect how Kestrel turns live market data into a risk-checked trade plan.
      </p>
    </div>
  );
}
