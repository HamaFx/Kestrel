'use client';

// SPDX-License-Identifier: Apache-2.0

// Left 7-column area of the landing hero: asset badge, monumental headline,
// high-conviction trader copy, calls to action and unboxed hardware specs.
import Image from 'next/image';

import { TacticalFlameButton } from '@/components/landing/landing-button';
import { Button } from '@/components/ui/button';

interface HeroCopyProps {
  isAuthenticated: boolean;
}

const HERO_SPECS = [
  { value: '4 Desks', label: 'Parallel War Room' },
  { value: '1 : 3+ R:R', label: 'Asymmetric Floor', highlight: true },
  { value: '≤ 1.0%', label: 'Hard Risk Cap' },
] as const;

export function HeroCopy({ isAuthenticated }: HeroCopyProps) {
  return (
    <div className="flex max-w-full min-w-0 flex-col items-start gap-7 lg:col-span-7">
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
          XAU/USD · 11 FOREX · 6 CRYPTO
        </span>
      </div>

      {/* Monumental Headline */}
      <h1 className="font-display text-4xl leading-[1.05] font-normal tracking-[-0.03em] sm:text-6xl lg:text-[70px]">
        <span className="bg-gradient-to-b from-white via-white/95 to-white/60 bg-clip-text text-transparent">
          YOUR INSTITUTIONAL
        </span>
        <br />
        <span className="font-redaction-35 text-brand tracking-normal italic">AI War Room</span>{' '}
        <span className="bg-gradient-to-b from-white via-white/95 to-white/60 bg-clip-text text-transparent">
          FOR GOLD &amp; FX.
        </span>
      </h1>

      {/* High-Conviction Trader Subtitle */}
      <p className="text-fg-muted max-w-xl font-sans text-base leading-relaxed sm:text-lg">
        Stop trading solo against institutions. Four specialist AI desks cross-examine price
        structure, Treasury yields, CFTC positioning, and a hard 1% risk cap before you pull the
        trigger.
      </p>

      {/* Primary & Secondary CTAs */}
      <div className="flex flex-wrap items-center gap-4 pt-1">
        <TacticalFlameButton
          href={isAuthenticated ? '/dashboard' : '/register'}
          label={isAuthenticated ? 'Open Dashboard' : 'Get Started'}
        />
        <a href="#stepper">
          <Button variant="secondary" size="lg" className="gap-2 px-5 text-sm font-medium">
            <span aria-hidden="true" className="bg-brand size-2 rounded-full" />
            Explore the Arsenal
          </Button>
        </a>
      </div>

      {/* Unboxed Precision Specs Strip */}
      <div className="grid w-full max-w-lg grid-cols-3 gap-6 border-t border-white/[0.08] pt-7">
        {HERO_SPECS.map((spec) => (
          <div key={spec.value} className="min-w-0">
            <div
              className={`font-mono text-xl font-bold tracking-tight tabular-nums sm:text-2xl ${
                'highlight' in spec && spec.highlight ? 'text-brand' : 'text-fg'
              }`}
            >
              {spec.value}
            </div>
            <div className="text-fg-subtle mt-1 font-sans text-xs">{spec.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
