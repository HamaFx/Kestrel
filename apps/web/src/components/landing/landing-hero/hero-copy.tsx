'use client';

// SPDX-License-Identifier: Apache-2.0

// Left column of the landing hero: asset badge, monumental headline,
// concise value-prop copy, calls to action and the hardware metric strip.
import Image from 'next/image';

import { TacticalFlameButton } from '@/components/landing/landing-button';
import { Button } from '@/components/ui/button';

interface HeroCopyProps {
  isAuthenticated: boolean;
}

const HERO_SPECS = [
  { value: '4 DESKS', label: 'Parallel Consensus' },
  { value: '≤ 1.0%', label: 'Hard Risk Guardrail', highlight: true },
  { value: 'AES-256', label: 'BYOK Key Vault' },
] as const;

export function HeroCopy({ isAuthenticated }: HeroCopyProps) {
  return (
    <div className="flex max-w-full min-w-0 flex-col items-start gap-6 lg:col-span-6">
      {/* Asset Coverage Badge */}
      <div className="border-brand/30 bg-brand/10 inline-flex items-center gap-2.5 rounded-full border px-3.5 py-1.5 shadow-[0_0_16px_rgba(255,54,22,0.14)]">
        <Image
          src="/brand/kestrel-falcon.svg"
          alt=""
          width={16}
          height={16}
          className="size-4"
          aria-hidden="true"
          priority
        />
        <span className="text-brand font-mono text-[11px] font-semibold tracking-[0.14em] uppercase">
          XAU/USD · 11 FX · 6 CRYPTO
        </span>
      </div>

      {/* Monumental Headline */}
      <h1 className="font-display text-4xl leading-[1.04] font-normal tracking-[-0.03em] sm:text-6xl lg:text-[68px]">
        <span className="bg-gradient-to-b from-white via-white/95 to-white/60 bg-clip-text text-transparent">
          FOUR AI DESKS.
        </span>
        <br />
        <span className="font-redaction-35 text-brand tracking-normal italic">One Verified</span>{' '}
        <span className="bg-gradient-to-b from-white via-white/95 to-white/60 bg-clip-text text-transparent">
          TRADE PLAN.
        </span>
      </h1>

      {/* Distilled 18-word Subtitle */}
      <p className="text-fg-muted max-w-xl font-sans text-base leading-relaxed sm:text-lg">
        Technical structure, central bank yields, 1% risk guardrails, and CFTC positioning—evaluated
        in parallel before you act.
      </p>

      {/* Primary & Secondary CTAs */}
      <div className="flex flex-wrap items-center gap-3.5 pt-1">
        <TacticalFlameButton
          href={isAuthenticated ? '/dashboard' : '/register'}
          label={isAuthenticated ? 'Open Terminal' : 'Launch Terminal'}
        />
        <a href="#simulator">
          <Button variant="secondary" size="lg" className="gap-2 px-5 font-mono text-xs uppercase">
            <span aria-hidden="true" className="bg-brand size-2 rounded-full" />
            Live Simulator
          </Button>
        </a>
      </div>

      {/* Precision Hardware Specs Strip */}
      <div className="grid w-full max-w-lg grid-cols-3 gap-4 border-t border-white/[0.08] pt-6">
        {HERO_SPECS.map((spec) => (
          <div key={spec.value} className="min-w-0">
            <div
              className={`font-mono text-lg font-bold tracking-tight tabular-nums sm:text-xl ${
                'highlight' in spec && spec.highlight ? 'text-brand' : 'text-fg'
              }`}
            >
              {spec.value}
            </div>
            <div className="text-fg-subtle mt-0.5 font-mono text-[11px] tracking-wider uppercase">
              {spec.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
