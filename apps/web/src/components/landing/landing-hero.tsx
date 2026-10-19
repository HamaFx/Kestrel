'use client';

/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { IconBuildingBank, IconChartCandle, IconRadar, IconScale } from '@tabler/icons-react';
import { m } from 'motion/react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useState } from 'react';

import { TacticalFlameButton } from '@/components/landing/landing-button';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

// The hologram pulls in three.js (~154 KB gzip). It already defers rendering
// via IntersectionObserver, so keep it out of the synchronous landing bundle
// and load it only when the client hydrates.
const Landing3DHologram = dynamic(
  () => import('@/components/landing/landing-3d-hologram').then((m) => m.Landing3DHologram),
  { ssr: false },
);

interface SymbolTelemetry {
  symbol: string;
  name: string;
  price: string;
  change: string;
  isPositive: boolean;
  spread: string;
  direction: 'BUY / LONG' | 'SELL / SHORT';
  entry: string;
  invalidation: string;
  target1: string;
  target2: string;
  rr: string;
  conviction: number;
  techSignal: string;
  macroSignal: string;
  riskSignal: string;
  sentimentSignal: string;
}

const SYMBOLS: SymbolTelemetry[] = [
  {
    symbol: 'XAU/USD',
    name: 'Spot Gold / US Dollar',
    price: '2,864.20',
    change: '+1.42% (+9.80)',
    isPositive: true,
    spread: '0.12 pts',
    direction: 'BUY / LONG',
    entry: '2,864.00',
    invalidation: '2,846.50',
    target1: '2,884.00',
    target2: '2,916.50',
    rr: '1:3.2',
    conviction: 91,
    techSignal: 'FVG +94%',
    macroSignal: 'Yields -4bp',
    riskSignal: '1% @ 2,846',
    sentimentSignal: 'Whales Long',
  },
  {
    symbol: 'EUR/USD',
    name: 'Euro / US Dollar',
    price: '1.0845',
    change: '+0.28% (+0.0030)',
    isPositive: true,
    spread: '0.4 pips',
    direction: 'BUY / LONG',
    entry: '1.0840',
    invalidation: '1.0812',
    target1: '1.0895',
    target2: '1.0930',
    rr: '1:3.1',
    conviction: 87,
    techSignal: 'Sweep +88%',
    macroSignal: 'ECB Hold',
    riskSignal: '0.8% SL',
    sentimentSignal: 'COT Bullish',
  },
  {
    symbol: 'GBP/USD',
    name: 'British Pound / US Dollar',
    price: '1.2912',
    change: '-0.15% (-0.0019)',
    isPositive: false,
    spread: '0.6 pips',
    direction: 'SELL / SHORT',
    entry: '1.2915',
    invalidation: '1.2950',
    target1: '1.2850',
    target2: '1.2805',
    rr: '1:3.0',
    conviction: 85,
    techSignal: 'Supply +85%',
    macroSignal: 'BoE Doves',
    riskSignal: '1% @ 1.295',
    sentimentSignal: 'Funds Short',
  },
];

const TICKER_ITEMS = [
  { symbol: 'XAU/USD', price: '$2,864.20', change: '+1.42%', up: true },
  { symbol: 'EUR/USD', price: '1.0845', change: '+0.28%', up: true },
  { symbol: 'GBP/USD', price: '1.2912', change: '-0.15%', up: false },
  { symbol: 'USD/JPY', price: '153.80', change: '-0.45%', up: false },
  { symbol: 'DXY', price: '104.12', change: '-0.34%', up: false },
  { symbol: 'US10Y', price: '4.28%', change: '-4.2bp', up: false },
];

export interface LandingHeroProps {
  isAuthenticated?: boolean;
}

export function LandingHero({ isAuthenticated = false }: LandingHeroProps) {
  const [activeSymbolIndex, setActiveSymbolIndex] = useState(0);
  const active = SYMBOLS[activeSymbolIndex] ?? SYMBOLS[0]!;

  // Seamless duplication for infinite marquee feel
  const doubledTicker = [...TICKER_ITEMS, ...TICKER_ITEMS];

  return (
    <section className="relative min-h-[92vh] overflow-hidden pt-6 pb-20 lg:pt-14 lg:pb-28">
      {/* ── Neoclassical Cyber-Art Backdrop (Horus / Kestrel Falcon Masterpiece) ── */}
      <div
        aria-hidden="true"
        className="hero-backdrop-mask pointer-events-none absolute top-16 right-0 z-0 h-[360px] w-full opacity-25 mix-blend-screen select-none sm:top-20 sm:h-[480px] lg:top-1/2 lg:right-0 lg:h-[80%] lg:w-[62%] lg:-translate-y-1/2 lg:opacity-35"
      >
        <Image
          src="/landing/kestrel-horus-statue.webp"
          alt="Sovereign Horus Falcon Neoclassical Sculpture"
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 62vw"
          className="object-contain object-center lg:object-right"
        />
      </div>

      {/* Decorative Grid Accent */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,54,22,0.08),transparent_50%)]"
      />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Top Market Ticker Strip */}
        <div className="mb-10 flex items-center justify-between overflow-hidden rounded-full border border-white/10 bg-[#141516]/80 px-4 py-2 shadow-sm backdrop-blur-md">
          <div className="z-10 flex shrink-0 items-center gap-2 border-r border-white/10 bg-[#141516]/90 pr-4">
            <span className="bg-bull size-2 animate-pulse rounded-full shadow-[0_0_6px_#3f9e3d]" />
            <span className="text-fg font-mono text-[11px] font-bold tracking-wider uppercase">
              LIVE MARKET PULSE
            </span>
          </div>

          <div className="mask-fade-x relative flex-1 overflow-hidden">
            <div className="ticker-track flex items-center gap-8 font-mono text-xs whitespace-nowrap">
              {doubledTicker.map((item, idx) => (
                <div key={`${item.symbol}-${idx}`} className="flex shrink-0 items-center gap-2">
                  <span className="text-fg-subtle">{item.symbol}</span>
                  <span className="text-fg font-semibold tabular-nums">{item.price}</span>
                  <span
                    className={cn(
                      'py-0.2 rounded px-1 text-[11px] font-medium tabular-nums',
                      item.up ? 'text-bull bg-bull/10' : 'text-bear bg-bear/10',
                    )}
                  >
                    {item.change}
                  </span>
                  <span className="ml-2 text-white/10 select-none">/</span>
                </div>
              ))}
            </div>
          </div>

          <div className="text-fg-subtle z-10 hidden shrink-0 items-center gap-2 border-l border-white/10 bg-[#141516]/90 pl-4 font-mono text-[11px] lg:flex">
            <span>ANALYST DESKS:</span>
            <span className="text-bull flex items-center gap-1.5 font-bold tabular-nums">
              <span className="bg-bull size-1.5 animate-ping rounded-full" />4 ACTIVE
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:items-center lg:gap-8">
          {/* Left Column: Monumental Headline & Value Prop */}
          <div className="flex min-w-0 max-w-full flex-col items-start gap-6 lg:col-span-7">
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
              <span className="font-redaction-35 text-brand tracking-normal italic">
                Institutional
              </span>{' '}
              <span className="bg-gradient-to-b from-white via-white/95 to-white/60 bg-clip-text text-transparent">
                GOLD & FOREX
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-fg-muted max-w-2xl font-sans text-base leading-relaxed sm:text-lg sm:leading-normal">
              Run a fast single-desk read in seconds, or summon the Full 4-Desk Committee: four
              specialist AI desks that evaluate price structure, central bank rate catalysts, 1%
              risk guardrails, and institutional COT positioning to deliver a clear, high-conviction
              trade plan.
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
                  Zero Setup
                </div>
                <div className="text-fg-subtle font-sans text-[11px] leading-tight sm:text-xs">
                  All AI & Feeds Included
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Interactive Hardware Telemetry Rig with 3D Hologram */}
          <div className="lg:col-span-5">
            <div className="surface-panel relative overflow-hidden rounded-2xl border border-white/15 bg-[#141516]/95 p-5 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.12)] sm:p-6">
              {/* Header Status & Symbol Switcher */}
              <div className="flex items-center justify-between border-b border-white/10 pb-3.5">
                <div className="flex items-center gap-2">
                  <span className="bg-bull size-2 animate-pulse rounded-full shadow-[0_0_8px_#3f9e3d]" />
                  <span className="text-fg font-mono text-xs font-bold tracking-wider uppercase">
                    LIVE COMMITTEE BRIEFING
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
                        onClick={() => setActiveSymbolIndex(idx)}
                        className={cn(
                          'relative rounded px-2.5 py-1 font-mono text-[10px] font-semibold transition-colors duration-200 active:translate-y-[0.5px]',
                          isSelected
                            ? 'text-white'
                            : 'text-fg-subtle hover:text-fg hover:bg-white/5',
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
                <div className="surface-well my-4 rounded-xl border border-white/5 bg-[#0b0c0d] p-4">
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
                    <div className="text-fg font-mono text-3xl font-bold tracking-tight tabular-nums sm:text-4xl">
                      {active.price}
                    </div>
                    <span className="text-fg-subtle font-mono text-[11px]">
                      Spread: {active.spread}
                    </span>
                  </div>
                </div>

                {/* ── Real-Time Interactive 3D WebGL Hologram ── */}
                <div className="relative my-3 flex h-[190px] w-full items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/60 shadow-inner sm:h-[220px]">
                  <div className="text-fg-subtle absolute top-2.5 left-3 z-10 flex items-center gap-2 font-mono text-[9px] select-none">
                    <span className="bg-brand size-1.5 animate-ping rounded-full" />
                    <span>MULTI-DESK CONSENSUS ENGINE</span>
                  </div>
                  <div className="text-brand/80 pointer-events-none absolute right-3 bottom-2 z-10 font-mono text-[9px] select-none">
                    DRAG TO INSPECT
                  </div>
                  <Landing3DHologram className="h-full w-full" />
                </div>

                {/* 4 Hardware Specialist Desks Row */}
                <div className="grid grid-cols-4 gap-2 py-2">
                  {/* Tech */}
                  <div className="surface-chip hover:border-bull/40 flex flex-col items-center gap-1.5 rounded-lg border border-white/10 bg-[#151617] p-2 shadow-xs transition-colors">
                    <div className="bg-bull/10 border-bull/20 text-bull flex size-7 items-center justify-center rounded border">
                      <IconChartCandle className="size-4" />
                    </div>
                    <span className="text-bull font-mono text-[10px] font-bold uppercase">
                      Tech
                    </span>
                    <span className="text-fg-subtle max-w-[64px] truncate text-center font-mono text-[9px]">
                      {active.techSignal}
                    </span>
                  </div>

                  {/* Macro */}
                  <div className="surface-chip hover:border-info/40 flex flex-col items-center gap-1.5 rounded-lg border border-white/10 bg-[#151617] p-2 shadow-xs transition-colors">
                    <div className="bg-info/10 border-info/20 text-info flex size-7 items-center justify-center rounded border">
                      <IconBuildingBank className="size-4" />
                    </div>
                    <span className="text-info font-mono text-[10px] font-bold uppercase">
                      Macro
                    </span>
                    <span className="text-fg-subtle max-w-[64px] truncate text-center font-mono text-[9px]">
                      {active.macroSignal}
                    </span>
                  </div>

                  {/* Risk */}
                  <div className="surface-chip hover:border-warn/40 flex flex-col items-center gap-1.5 rounded-lg border border-white/10 bg-[#151617] p-2 shadow-xs transition-colors">
                    <div className="bg-warn/10 border-warn/20 text-warn flex size-7 items-center justify-center rounded border">
                      <IconScale className="size-4" />
                    </div>
                    <span className="text-warn font-mono text-[10px] font-bold uppercase">
                      Risk
                    </span>
                    <span className="text-fg-subtle max-w-[64px] truncate text-center font-mono text-[9px]">
                      {active.riskSignal}
                    </span>
                  </div>

                  {/* Sentinel */}
                  <div className="surface-chip hover:border-brand/40 flex flex-col items-center gap-1.5 rounded-lg border border-white/10 bg-[#151617] p-2 shadow-xs transition-colors">
                    <div className="bg-brand/10 border-brand/20 text-brand flex size-7 items-center justify-center rounded border">
                      <IconRadar className="size-4" />
                    </div>
                    <span className="text-brand font-mono text-[10px] font-bold uppercase">
                      Whales
                    </span>
                    <span className="text-fg-subtle max-w-[64px] truncate text-center font-mono text-[9px]">
                      {active.sentimentSignal}
                    </span>
                  </div>
                </div>

                {/* Consensus Trade Card */}
                <div className="border-brand/30 bg-brand/[0.06] mt-3 rounded-xl border p-4 shadow-sm">
                  <div className="flex items-center justify-between">
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
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Background watermark in Bebas Neue */}
      <div
        aria-hidden="true"
        className="font-bebas pointer-events-none absolute -bottom-10 left-6 z-0 text-[110px] font-normal tracking-widest text-white/[0.02] uppercase select-none lg:text-[180px]"
      >
        KESTREL // SOVEREIGN AI
      </div>
    </section>
  );
}
