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

import { useState } from 'react';
import Image from 'next/image';
import { Link } from 'next-view-transitions';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import { TacticalFlameButton } from '@/components/landing/landing-button';
import { Landing3DHologram } from '@/components/landing/landing-3d-hologram';
import { cn } from '@/lib/cn';
import {
  ChartWizardSprite,
  MacroMageSprite,
  RiskKnightSprite,
  KestrelFalconSprite,
} from '@/components/chat/parts/pixel-desk/pixel-sprites';

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

export function LandingHero() {
  const [activeSymbolIndex, setActiveSymbolIndex] = useState(0);
  const active = SYMBOLS[activeSymbolIndex] ?? SYMBOLS[0]!;

  return (
    <section className="relative min-h-[92vh] overflow-hidden pt-6 pb-20 lg:pt-14 lg:pb-28">
      {/* ── Neoclassical Cyber-Art Backdrop (Horus / Kestrel Falcon Masterpiece) ── */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 w-full lg:w-[62%] h-[80%] z-0 select-none opacity-25 lg:opacity-35 mix-blend-screen"
        style={{
          maskImage: 'radial-gradient(ellipse 70% 65% at 65% 50%, black 30%, transparent 80%)',
          WebkitMaskImage: 'radial-gradient(ellipse 70% 65% at 65% 50%, black 30%, transparent 80%)',
        }}
      >
        <Image
          src="/landing/kestrel-horus-statue.webp"
          alt="Sovereign Horus Falcon Neoclassical Sculpture"
          fill
          priority
          unoptimized
          sizes="(max-width: 1024px) 100vw, 65vw"
          className="object-cover object-center"
        />
      </div>

      {/* ── Hoplite Bottom-Up Ember Heat Gradient ── */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 select-none opacity-80"
        style={{
          background:
            'radial-gradient(ellipse 70% 160% at 85% 100%, rgba(255, 54, 22, 0.26) 0%, rgba(255, 54, 22, 0.10) 35%, rgba(255, 54, 22, 0.02) 60%, transparent 75%)',
        }}
      />

      {/* Halftone Texture Overlay */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(#ffffff08_1px,transparent_1px)] [background-size:24px_24px] opacity-40"
      />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Top Market Ticker Strip */}
        <div className="mb-10 flex items-center justify-between overflow-x-auto rounded-full border border-white/10 bg-[#141516]/80 px-4 py-2 backdrop-blur-md shadow-sm">
          <div className="flex items-center gap-2 pr-4 border-r border-white/10 shrink-0">
            <span className="size-2 rounded-full bg-bull animate-pulse shadow-[0_0_6px_#3f9e3d]" />
            <span className="font-mono text-[11px] font-bold tracking-wider text-fg uppercase">
              INTERBANK L2
            </span>
          </div>

          <div className="flex items-center gap-6 overflow-x-auto px-4 text-xs font-mono">
            {TICKER_ITEMS.map((item) => (
              <div key={item.symbol} className="flex items-center gap-2 shrink-0">
                <span className="text-fg-subtle">{item.symbol}</span>
                <span className="text-fg font-semibold tabular-nums">{item.price}</span>
                <span className={cn('text-[11px] font-medium tabular-nums', item.up ? 'text-bull' : 'text-bear')}>
                  {item.change}
                </span>
              </div>
            ))}
          </div>

          <div className="hidden lg:flex items-center gap-2 pl-4 border-l border-white/10 text-[11px] font-mono text-fg-subtle shrink-0">
            <span>FEED LATENCY:</span>
            <span className="text-bull font-bold tabular-nums">18ms</span>
          </div>
        </div>

        <div className="grid gap-12 lg:grid-cols-12 lg:items-center lg:gap-8">
          {/* Left Column: Monumental Headline & Value Prop */}
          <div className="flex flex-col items-start gap-6 lg:col-span-7">
            {/* Predator Badge */}
            <div className="inline-flex items-center gap-2.5 rounded-full border border-brand/30 bg-brand/10 px-3.5 py-1.5 shadow-[0_0_16px_rgba(255,54,22,0.15)]">
              <img src="/brand/kestrel-falcon.svg" alt="" className="size-4 text-brand" aria-hidden="true" />
              <span className="font-mono text-xs font-semibold tracking-wider text-brand uppercase">
                Sovereign Intelligence Engine
              </span>
            </div>

            {/* Monumental Headline */}
            <h1 className="font-display text-4xl leading-[1.06] font-normal tracking-[-0.03em] text-fg sm:text-6xl lg:text-[70px]">
              THE APEX AI COMMITTEE FOR{' '}
              <span className="font-redaction-35 italic text-brand tracking-normal">
                Institutional
              </span>{' '}
              GOLD & FOREX
            </h1>

            {/* Subtitle */}
            <p className="max-w-2xl font-sans text-base leading-relaxed text-fg-muted sm:text-lg sm:leading-normal">
              Four autonomous specialist desks synthesize price action structure, macro rate catalysts, 1% risk governance, and institutional COT positioning into a unified, high-conviction market verdict.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <TacticalFlameButton href="/login" label="Launch Terminal" />
              <a href="#simulator">
                <Button variant="secondary" size="lg" className="px-5 text-sm font-medium gap-2">
                  <span className="size-2 rounded-full bg-brand animate-pulse" />
                  Try Live Simulator
                </Button>
              </a>
              <a href="#desks">
                <Button variant="ghost" size="lg" className="px-4 text-sm font-medium text-fg-muted hover:text-fg">
                  Explore 4 Desks
                </Button>
              </a>
            </div>

            {/* Social Proof / Metrics strip */}
            <div className="grid grid-cols-3 gap-6 pt-6 border-t border-white/10 w-full max-w-lg">
              <div>
                <div className="font-mono text-2xl font-bold tracking-tight text-fg tabular-nums">
                  4 Desks
                </div>
                <div className="font-sans text-xs text-fg-subtle">Autonomous Syndicate</div>
              </div>
              <div>
                <div className="font-mono text-2xl font-bold tracking-tight text-brand tabular-nums">
                  1:3+ R:R
                </div>
                <div className="font-sans text-xs text-fg-subtle">Mathematical Floor</div>
              </div>
              <div>
                <div className="font-mono text-2xl font-bold tracking-tight text-fg tabular-nums">
                  0.0%
                </div>
                <div className="font-sans text-xs text-fg-subtle">Custodial Exposure</div>
              </div>
            </div>
          </div>

          {/* Right Column: Interactive Hardware Telemetry Rig with 3D Hologram */}
          <div className="lg:col-span-5">
            <div className="surface-panel relative overflow-hidden rounded-2xl border border-white/15 bg-[#141516]/95 p-5 sm:p-6 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.12)]">
              {/* Header Status & Symbol Switcher */}
              <div className="flex items-center justify-between border-b border-white/10 pb-3.5">
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-bull animate-pulse shadow-[0_0_8px_#3f9e3d]" />
                  <span className="font-mono text-xs font-bold tracking-wider text-fg uppercase">
                    DELIBERATION RIG
                  </span>
                </div>

                {/* Symbol Pills with Fluid Gliding Indicator */}
                <div className="flex items-center gap-1 rounded-lg bg-black/40 p-1 border border-white/5">
                  {SYMBOLS.map((s, idx) => {
                    const isSelected = idx === activeSymbolIndex;
                    return (
                      <button
                        key={s.symbol}
                        type="button"
                        onClick={() => setActiveSymbolIndex(idx)}
                        className={cn(
                          'relative px-2.5 py-1 rounded font-mono text-[10px] font-semibold transition-colors duration-200',
                          isSelected
                            ? 'text-white'
                            : 'text-fg-subtle hover:text-fg hover:bg-white/5',
                        )}
                      >
                        {isSelected && (
                          <motion.div
                            layoutId="hero-symbol-gliding-pill"
                            className="absolute inset-0 rounded bg-brand shadow-sm -z-10"
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
                  <div className="my-4 rounded-xl surface-well p-4 border border-white/5 bg-[#0b0c0d]">
                    <div className="flex items-baseline justify-between">
                      <span className="font-sans text-xs text-fg-subtle uppercase tracking-wider">
                        {active.name}
                      </span>
                      <span className={cn('font-mono text-xs font-semibold', active.isPositive ? 'text-bull' : 'text-bear')}>
                        {active.isPositive ? '▲' : '▼'} {active.change}
                      </span>
                    </div>
                    <div className="mt-1 flex items-baseline justify-between">
                      <div className="font-mono text-3xl sm:text-4xl font-bold tracking-tight text-fg tabular-nums">
                        {active.price}
                      </div>
                      <span className="font-mono text-[11px] text-fg-subtle">
                        Spread: {active.spread}
                      </span>
                    </div>
                  </div>

                  {/* ── Real-Time Interactive 3D WebGL Hologram ── */}
                  <div className="relative w-full h-[190px] sm:h-[220px] rounded-xl overflow-hidden bg-black/60 border border-white/10 my-3 flex items-center justify-center shadow-inner">
                    <div className="absolute top-2.5 left-3 flex items-center gap-2 z-10 font-mono text-[9px] text-fg-subtle select-none">
                      <span className="size-1.5 rounded-full bg-brand animate-ping" />
                      <span>3D LIQUIDITY GYRO // INTERACTIVE WEBGL</span>
                    </div>
                    <div className="absolute bottom-2 right-3 font-mono text-[9px] text-brand/80 z-10 select-none pointer-events-none">
                      ROTATE · TILT WITH MOUSE
                    </div>
                    <Landing3DHologram className="w-full h-full" />
                  </div>

                  {/* 4 Hardware Specialist Desks Row */}
                  <div className="grid grid-cols-4 gap-2 py-2">
                    {/* Tech */}
                    <div className="flex flex-col items-center gap-1.5 p-2 rounded-lg bg-white/[0.03] border border-white/5 hover:border-white/10 transition-colors">
                      <ChartWizardSprite isThinking bias="bullish" />
                      <span className="font-mono text-[10px] font-bold text-bull uppercase">Tech</span>
                      <span className="font-mono text-[9px] text-fg-subtle truncate max-w-[64px] text-center">
                        {active.techSignal}
                      </span>
                    </div>

                    {/* Macro */}
                    <div className="flex flex-col items-center gap-1.5 p-2 rounded-lg bg-white/[0.03] border border-white/5 hover:border-white/10 transition-colors">
                      <MacroMageSprite isDone bias="bullish" />
                      <span className="font-mono text-[10px] font-bold text-info uppercase">Macro</span>
                      <span className="font-mono text-[9px] text-fg-subtle truncate max-w-[64px] text-center">
                        {active.macroSignal}
                      </span>
                    </div>

                    {/* Risk */}
                    <div className="flex flex-col items-center gap-1.5 p-2 rounded-lg bg-white/[0.03] border border-white/5 hover:border-white/10 transition-colors">
                      <RiskKnightSprite isDone bias="bullish" />
                      <span className="font-mono text-[10px] font-bold text-warn uppercase">Risk</span>
                      <span className="font-mono text-[9px] text-fg-subtle truncate max-w-[64px] text-center">
                        {active.riskSignal}
                      </span>
                    </div>

                    {/* Sentinel */}
                    <div className="flex flex-col items-center gap-1.5 p-2 rounded-lg bg-white/[0.03] border border-white/5 hover:border-white/10 transition-colors">
                      <KestrelFalconSprite isDone bias="bullish" />
                      <span className="font-mono text-[10px] font-bold text-brand uppercase">Whales</span>
                      <span className="font-mono text-[9px] text-fg-subtle truncate max-w-[64px] text-center">
                        {active.sentimentSignal}
                      </span>
                    </div>
                  </div>

                  {/* Consensus Trade Card */}
                  <div className="mt-3 rounded-xl border border-brand/30 bg-brand/[0.06] p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-fg uppercase">
                          Committee Order Plan
                        </span>
                        <span className="font-mono text-[10px] text-brand bg-brand/10 border border-brand/20 px-1.5 py-0.5 rounded">
                          {active.conviction}% Conviction
                        </span>
                      </div>
                      <span
                        className={cn(
                          'font-mono text-xs font-bold px-2 py-0.5 rounded uppercase border',
                          active.direction.startsWith('BUY')
                            ? 'text-bull bg-bull/10 border-bull/30'
                            : 'text-bear bg-bear/10 border-bear/30',
                        )}
                      >
                        {active.direction}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-xs tabular-nums text-center">
                      <div className="rounded-lg surface-well p-2 bg-[#0a0b0c] border border-white/5">
                        <span className="text-[10px] text-fg-subtle block">ENTRY</span>
                        <span className="font-bold text-fg">{active.entry}</span>
                      </div>
                      <div className="rounded-lg surface-well p-2 bg-[#0a0b0c] border border-white/5">
                        <span className="text-[10px] text-bear block">INVALIDATION</span>
                        <span className="font-bold text-bear">{active.invalidation}</span>
                      </div>
                      <div className="rounded-lg surface-well p-2 bg-[#0a0b0c] border border-white/5">
                        <span className="text-[10px] text-bull block">TARGET ({active.rr})</span>
                        <span className="font-bold text-bull">{active.target2}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
          </div>
        </div>
      </div>
    </section>
  );
}
