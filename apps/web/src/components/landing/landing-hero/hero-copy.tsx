'use client';

// SPDX-License-Identifier: Apache-2.0

// Left column of the landing hero: predator badge, monumental headline,
// value-prop copy, calls to action and the social-proof metric strip.
import Image from 'next/image';

import { TacticalFlameButton } from '@/components/landing/landing-button';
import { Button } from '@/components/ui/button';

interface HeroCopyProps {
  isAuthenticated: boolean;
}

export function HeroCopy({ isAuthenticated }: HeroCopyProps) {
  return (
    <div className="flex max-w-full min-w-0 flex-col items-start gap-6 lg:col-span-7">
      {/* Predator Badge */}
      <div className="border-brand/30 bg-brand/10 inline-flex items-center gap-2.5 rounded-full border px-3.5 py-1.5 shadow-[0_0_16px_rgba(255,54,22,0.15)]">
        <Image
          src="/brand/kestrel-falcon.svg"
          alt=""
          width={16}
          height={16}
          className="size-4"
          aria-hidden="true"
          priority
        />
        <span className="text-brand font-mono text-xs font-semibold tracking-wider uppercase">
          AI Market Research & Trade Copilot
        </span>
      </div>

      {/* Monumental Headline with Hoplite Dual Radial/Linear Ink Text Clip */}
      <h1 className="font-display text-4xl leading-[1.06] font-normal tracking-[-0.03em] sm:text-6xl lg:text-[70px]">
        <span className="bg-gradient-to-b from-white via-white/95 to-white/60 bg-clip-text text-transparent">
          THE APEX AI COMMITTEE FOR{' '}
        </span>
        <span className="font-redaction-35 text-brand tracking-normal italic">Institutional</span>{' '}
        <span className="bg-gradient-to-b from-white via-white/95 to-white/60 bg-clip-text text-transparent">
          GOLD & FOREX
        </span>
      </h1>

      {/* Subtitle */}
      <p className="text-fg-muted max-w-2xl font-sans text-base leading-relaxed sm:text-lg sm:leading-normal">
        Run a fast single-desk read in seconds, or summon the Full 4-Desk Committee: four specialist
        AI desks that evaluate price structure, central bank rate catalysts, 1% risk guardrails, and
        institutional COT positioning to deliver a clear, high-conviction trade plan.
      </p>

      {/* CTAs */}
      <div className="flex flex-wrap items-center gap-4 pt-2">
        <TacticalFlameButton
          href={isAuthenticated ? '/dashboard' : '/register'}
          label={isAuthenticated ? 'Open Dashboard' : 'Get Started'}
        />
        <a href="#simulator">
          <Button variant="secondary" size="lg" className="gap-2 px-5 text-sm font-medium">
            <span className="bg-brand size-2 animate-pulse rounded-full" />
            Try Live Simulator
          </Button>
        </a>
        <a href="#desks">
          <Button
            variant="ghost"
            size="lg"
            className="text-fg-muted hover:text-fg px-4 text-sm font-medium"
          >
            Explore the Desks
          </Button>
        </a>
      </div>

      {/* Social Proof / Metrics strip */}
      <div className="grid w-full max-w-lg grid-cols-3 gap-3 border-t border-white/10 pt-6 sm:gap-6">
        <div className="min-w-0">
          <div className="text-fg font-mono text-xl font-bold tracking-tight tabular-nums sm:text-2xl">
            1 or 4 Desks
          </div>
          <div className="text-fg-subtle font-sans text-[11px] leading-tight sm:text-xs">
            Quick Read or Full Committee
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-brand font-mono text-xl font-bold tracking-tight tabular-nums sm:text-2xl">
            1:3+ R:R
          </div>
          <div className="text-fg-subtle font-sans text-[11px] leading-tight sm:text-xs">
            Asymmetric Target Floor
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-fg font-mono text-xl font-bold tracking-tight tabular-nums sm:text-2xl">
            BYOK Vault
          </div>
          <div className="text-fg-subtle font-sans text-[11px] leading-tight sm:text-xs">
            Encrypted Key & Spend Control
          </div>
        </div>
      </div>
    </div>
  );
}
