'use client';

// SPDX-License-Identifier: Apache-2.0

// Left column of the landing hero: high-impact headline, clear value prop,
// calls to action, and trader superpower proof strip.
import Image from 'next/image';

import { TacticalFlameButton } from '@/components/landing/landing-button';
import { Button } from '@/components/ui/button';

interface HeroCopyProps {
  isAuthenticated: boolean;
}

export function HeroCopy({ isAuthenticated }: HeroCopyProps) {
  return (
    <div className="flex max-w-full min-w-0 flex-col items-start gap-6 lg:col-span-6">
      {/* Brand Pill */}
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
          Your 24/7 AI Trading Copilot
        </span>
      </div>

      {/* Monumental Hype Headline */}
      <h1 className="font-display text-4xl leading-[1.05] font-normal tracking-[-0.03em] sm:text-6xl lg:text-[68px]">
        <span className="bg-gradient-to-b from-white via-white/95 to-white/60 bg-clip-text text-transparent">
          TRADE WITH AN UNFAIR{' '}
        </span>
        <span className="font-redaction-35 text-brand tracking-normal italic">Advantage</span>
      </h1>

      {/* Clear, Exciting Trader Subtitle */}
      <p className="text-fg-muted max-w-xl font-sans text-base leading-relaxed sm:text-lg sm:leading-normal">
        Drop any chart screenshot, ask a question by voice, or let Kestrel watch the markets while
        you sleep. Get instant, emotion-free trade plans with automatic 1% risk protection, built-in
        paper trading, and live Telegram alerts before the move happens.
      </p>

      {/* CTAs */}
      <div className="flex flex-wrap items-center gap-4 pt-1">
        <TacticalFlameButton
          href={isAuthenticated ? '/dashboard' : '/register'}
          label={isAuthenticated ? 'Open Dashboard' : 'Start Trading Smarter'}
        />
        <a href="#simulator">
          <Button variant="secondary" size="lg" className="gap-2 px-5 text-sm font-medium">
            <span aria-hidden="true" className="bg-brand size-2 rounded-full" />
            Try Interactive Demo
          </Button>
        </a>
        <a href="#architecture">
          <Button
            variant="ghost"
            size="lg"
            className="text-fg-muted hover:text-fg px-4 text-sm font-medium"
          >
            Explore Superpowers
          </Button>
        </a>
      </div>

      {/* Simple, High-Impact Proof Strip */}
      <div className="grid w-full max-w-xl grid-cols-3 gap-4 border-t border-white/10 pt-6 sm:gap-6">
        <div className="min-w-0">
          <div className="text-fg font-mono text-xl font-bold tracking-tight tabular-nums sm:text-2xl">
            5-Sec Vision
          </div>
          <div className="text-fg-subtle font-sans text-[11px] leading-tight sm:text-xs">
            Drop Any Chart Screenshot
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-brand font-mono text-xl font-bold tracking-tight tabular-nums sm:text-2xl">
            1% Shield
          </div>
          <div className="text-fg-subtle font-sans text-[11px] leading-tight sm:text-xs">
            Blocks FOMO & Over-Risk
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-fg font-mono text-xl font-bold tracking-tight tabular-nums sm:text-2xl">
            24/7 Radar
          </div>
          <div className="text-fg-subtle font-sans text-[11px] leading-tight sm:text-xs">
            Telegram & Phone Alerts
          </div>
        </div>
      </div>
    </div>
  );
}
