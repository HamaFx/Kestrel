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
import {
  IconArrowsSplit,
  IconBolt,
  IconCpu,
  IconLayersLinked,
  IconLock,
  IconScale,
  IconShieldLock,
} from '@tabler/icons-react';
import { AnimatePresence, m } from 'motion/react';
import { useState } from 'react';

import { cn } from '@/lib/cn';

interface LayerSpec {
  id: string;
  num: string;
  tag: string;
  title: string;
  shortDesc: string;
  fullDesc: string;
  accentColor: string;
  borderColor: string;
  glowColor: string;
  icon: React.ComponentType<{ className?: string }>;
  telemetry: { label: string; value: string }[];
}

const LAYERS: LayerSpec[] = [
  {
    id: 'execution',
    num: '04',
    tag: 'APEX EXECUTION LAYER',
    title: 'Verified Trade Plans & Take-Profit Cones',
    shortDesc: 'Structured trade cards with entry, invalidation, and 3 take-profit targets.',
    fullDesc:
      'Every approved setup produces a structured trade plan with exact entry zones, hard invalidation stops, and multi-tier take-profit targets ready to save to your Trade Journal or arm as instant alerts (with direct MT5 / cTrader bridge support on our roadmap).',
    accentColor: 'text-bull',
    borderColor: 'border-bull/50',
    glowColor: 'rgba(63, 158, 61, 0.4)',
    icon: IconArrowsSplit,
    telemetry: [
      { label: 'WORKFLOW OUTPUT', value: 'Trade Journal & Price Alerts' },
      { label: 'TARGET RATIOS', value: '1:1.5 · 1:2.5 · 1:4.0 R:R' },
      { label: 'ALERT CHANNELS', value: 'Telegram · Web Push · Email' },
      { label: 'BROKER BRIDGE', value: 'MT5 / cTrader (On Roadmap)' },
    ],
  },
  {
    id: 'risk',
    num: '03',
    tag: 'SAFETY GOVERNOR LAYER',
    title: '1.0% Risk Limit & Invalidation Guardrail',
    shortDesc: 'Strict drawdown protection that flags unsafe setups before you enter.',
    fullDesc:
      'The Risk Desk enforces a strict 1.0% account risk discipline. If high-impact news is imminent or volatility requires a stop-loss wider than your risk rules allow, Kestrel warns you to stand down or reduce size.',
    accentColor: 'text-warn',
    borderColor: 'border-warn/50',
    glowColor: 'rgba(235, 140, 31, 0.4)',
    icon: IconScale,
    telemetry: [
      { label: 'PORTFOLIO CEILING', value: '≤ 1.0% Max Loss' },
      { label: 'MIN RISK / REWARD', value: '≥ 1:2.5 Asymmetric Target' },
      { label: 'CONFLICT PROTECTION', value: 'Instant Risk Warning' },
      { label: 'STOP PLACEMENT', value: 'ATR (14) Volatility Buffer' },
    ],
  },
  {
    id: 'deliberation',
    num: '02',
    tag: 'CONSENSUS SYNDICATE LAYER',
    title: '4-Desk Specialist AI Committee',
    shortDesc: 'Four specialized AI analysts evaluating independent market factors.',
    fullDesc:
      'Four specialist AI desks analyze your setup in parallel: Technicals maps price structure and Fair Value Gaps, Macro tracks central bank policy and yields, Risk calculates position sizing, and Sentiment monitors institutional COT positioning.',
    accentColor: 'text-brand',
    borderColor: 'border-brand/50',
    glowColor: 'rgba(255, 54, 22, 0.45)',
    icon: IconCpu,
    telemetry: [
      { label: 'SPECIALIST DESKS', value: '4 Parallel AI Analysts' },
      { label: 'CONSENSUS METHOD', value: 'Weighted Conviction Score' },
      { label: 'ANALYSIS MODES', value: 'Quick Read or Full Committee' },
      { label: 'SIGNAL INTEGRITY', value: 'Cross-Checked Against Live Data' },
    ],
  },
  {
    id: 'ingestion',
    num: '01',
    tag: 'FOUNDATION DATA LAYER',
    title: 'Live Gold, Forex & Macro Market Feeds',
    shortDesc: 'Real-time price action, technical indicators, and economic calendar.',
    fullDesc:
      'Continuously tracks Spot Gold (XAU/USD), major Forex pairs, and top crypto perpetuals alongside US 2Y/10Y Treasury yields, the Dollar Index (DXY), breaking financial headlines, and red-folder economic releases.',
    accentColor: 'text-info',
    borderColor: 'border-info/50',
    glowColor: 'rgba(38, 126, 224, 0.4)',
    icon: IconBolt,
    telemetry: [
      { label: 'PRIMARY MARKETS', value: 'XAU/USD · EUR · GBP · JPY' },
      { label: 'MACRO BENCHMARKS', value: 'US10Y / US02Y · DXY Index' },
      { label: 'TECHNICAL ENGINE', value: 'RSI · EMA · MACD · ATR · FVG' },
      { label: 'CALENDAR & WIRES', value: 'Live Red-Folder Event Alerts' },
    ],
  },
];

export function LandingArchitecture() {
  const [activeLayerId, setActiveLayerId] = useState<string>('risk');
  const [hoveredLayerId, setHoveredLayerId] = useState<string | null>(null);

  const effectiveId = hoveredLayerId ?? activeLayerId;
  const activeIndex = LAYERS.findIndex((l) => l.id === effectiveId);
  const activeLayer = LAYERS[activeIndex >= 0 ? activeIndex : 1]!;

  return (
    <section
      id="architecture"
      className="relative overflow-hidden border-t border-white/5 bg-[#0e0f10] py-28 lg:py-36"
    >
      {/* Background Halftone Columns & Ambient Light Cone */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-contain bg-left bg-no-repeat opacity-15 select-none"
        style={{ backgroundImage: 'url(/landing/faq-halftone-columns.png)' }}
      />
      <div
        aria-hidden="true"
        className="bg-brand/5 pointer-events-none absolute right-1/4 -bottom-40 size-[700px] rounded-full blur-[160px] select-none"
      />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header with Concentric Rotating Marquee Badge */}
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
            Every trade setup passes through four independent layers of verification. Hover or tap
            any layer below to inspect how Kestrel turns live market data into a risk-checked trade
            plan.
          </p>
        </div>

        {/* ── 3D ISOMETRIC EXPLODED STACK WORKBENCH ── */}
        <div className="grid gap-12 lg:grid-cols-12 lg:items-center">
          {/* Left Column: Layer Selector Tabs */}
          <div className="flex flex-col gap-3 lg:col-span-4">
            {LAYERS.map((layer) => {
              const isActive = layer.id === activeLayerId;
              const Icon = layer.icon;
              return (
                <button
                  key={layer.id}
                  type="button"
                  onClick={() => setActiveLayerId(layer.id)}
                  onMouseEnter={() => setHoveredLayerId(layer.id)}
                  onMouseLeave={() => setHoveredLayerId(null)}
                  className={cn(
                    'group relative flex cursor-pointer items-start gap-4 rounded-xl border p-4 text-left transition-all duration-200 active:translate-y-[0.5px] sm:p-5',
                    isActive
                      ? 'surface-chip border-white/20 bg-[#171819] shadow-[var(--shadow-chip)]'
                      : 'border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]',
                  )}
                >
                  {/* Active Indicator Top Line */}
                  {isActive && (
                    <m.div
                      layoutId="active-iso-tab-indicator"
                      className="border-brand/40 bg-brand/[0.03] absolute inset-0 -z-10 rounded-xl border"
                      transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                    />
                  )}

                  <div
                    className={cn(
                      'flex size-10 shrink-0 items-center justify-center rounded-lg border font-mono text-xs font-bold transition-colors',
                      isActive
                        ? 'bg-brand border-brand text-white shadow-[0_0_14px_rgba(255,54,22,0.5)]'
                        : 'text-fg-subtle group-hover:text-fg border-white/10 bg-black/40',
                    )}
                  >
                    {layer.num}
                  </div>

                  <div className="flex w-full flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="text-brand font-mono text-[10px] font-bold tracking-wider uppercase">
                        {layer.tag}
                      </span>
                      <Icon
                        className={cn('size-4', isActive ? layer.accentColor : 'text-fg-subtle')}
                      />
                    </div>
                    <h3 className="font-display text-fg text-base font-normal tracking-tight group-hover:text-white">
                      {layer.title}
                    </h3>
                    <p className="text-fg-muted font-sans text-xs leading-relaxed">
                      {layer.shortDesc}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Center Column: Interactive 3D Exploded Isometric Stack Projection */}
          <div className="flex items-center justify-center py-12 lg:col-span-5 lg:py-0">
            <div
              className="relative h-[480px] w-[320px] select-none sm:w-[380px]"
              style={{
                perspective: '1200px',
                transformStyle: 'preserve-3d',
              }}
            >
              {/* 4 Floating 3D Isometric Plates with Dynamic Spring Separation Physics */}
              {LAYERS.map((layer, index) => {
                const isActive = layer.id === effectiveId;
                const separationY =
                  index === activeIndex
                    ? -18
                    : index < activeIndex
                      ? -(activeIndex - index) * 78
                      : (index - activeIndex) * 78;

                const baseTopPercent = index * 24 + 8;
                const LayerIcon = layer.icon;

                return (
                  <m.div
                    key={layer.id}
                    onClick={() => setActiveLayerId(layer.id)}
                    onMouseEnter={() => setHoveredLayerId(layer.id)}
                    onMouseLeave={() => setHoveredLayerId(null)}
                    animate={{
                      y: separationY,
                      scale: isActive ? 1.06 : 0.96,
                      opacity: isActive ? 1 : 0.65,
                    }}
                    transition={{
                      type: 'spring',
                      stiffness: 320,
                      damping: 24,
                      mass: 0.8,
                    }}
                    className="group absolute inset-x-0 cursor-pointer"
                    style={{
                      top: `${baseTopPercent}%`,
                      zIndex: isActive ? 50 : 20 + (4 - index),
                      transformStyle: 'preserve-3d',
                    }}
                  >
                    {/* The Axonometric Plate */}
                    <div
                      className={cn(
                        'relative flex aspect-[354/195] w-full flex-col justify-between rounded-2xl border p-5 backdrop-blur-md transition-all duration-300',
                        isActive
                          ? 'border-brand ring-brand/40 bg-[#18191b]/98 shadow-[0_24px_60px_rgba(255,54,22,0.35),inset_0_1.5px_0_rgba(255,255,255,0.3)] ring-1'
                          : 'border-white/10 bg-[#111213]/85 shadow-[0_12px_32px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.1)] hover:border-white/20 hover:bg-[#141516]/95',
                      )}
                      style={{
                        transform: 'rotate(30deg) skewX(-30deg) scaleY(0.866025)',
                        transformStyle: 'preserve-3d',
                      }}
                    >
                      <div className="flex items-center justify-between border-b border-white/10 pb-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              'size-2 rounded-full',
                              isActive
                                ? 'bg-brand animate-pulse shadow-[0_0_8px_#ff3616]'
                                : 'bg-white/20',
                            )}
                          />
                          <span className="text-fg-subtle font-mono text-[10px] font-bold tracking-wider uppercase">
                            TIER {layer.num} // {layer.id.toUpperCase()}
                          </span>
                        </div>
                        <LayerIcon
                          className={cn('size-4', isActive ? layer.accentColor : 'text-fg-subtle')}
                        />
                      </div>

                      <div className="flex items-center justify-between font-mono text-[10px]">
                        <span
                          className={cn(
                            'font-bold tracking-wider',
                            isActive ? 'text-fg' : 'text-fg-subtle',
                          )}
                        >
                          {layer.title}
                        </span>
                        {isActive && (
                          <span className="text-brand bg-brand/10 border-brand/30 rounded border px-1.5 py-0.5 text-[9px] font-bold shadow-[0_0_8px_rgba(255,54,22,0.2)]">
                            ACTIVE LAYER
                          </span>
                        )}
                      </div>

                      <div className="text-fg-subtle flex items-center justify-between border-t border-white/5 pt-1.5 font-mono text-[9px]">
                        <div className="flex items-center gap-1">
                          <IconShieldLock className="text-bull size-3" />
                          <span>VERIFIED LAYER</span>
                        </div>
                        <span className="text-bull font-semibold">ACTIVE</span>
                      </div>
                    </div>
                  </m.div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Active Layer Live Telemetry Console */}
          <div className="lg:col-span-3">
            <div className="surface-panel relative flex flex-col gap-5 overflow-hidden rounded-2xl border border-white/15 bg-[#121314] p-6 shadow-2xl">
              {/* Lit Corner Flare */}
              <div
                aria-hidden="true"
                className="bg-brand/10 pointer-events-none absolute -top-12 -right-12 size-32 rounded-full blur-2xl select-none"
              />

              <div className="relative z-10 flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <span className="bg-brand size-2 animate-pulse rounded-full shadow-[0_0_8px_#ff3616]" />
                  <span className="text-brand font-mono text-[10px] font-bold tracking-wider uppercase">
                    TIER {activeLayer.num} TELEMETRY
                  </span>
                </div>
                <div className="text-bull flex items-center gap-1 font-mono text-[10px]">
                  <IconLayersLinked className="size-3.5" />
                  <span>SYNCED</span>
                </div>
              </div>

              <AnimatePresence mode="wait">
                <m.div
                  key={activeLayer.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.18 }}
                  className="relative z-10 flex flex-col gap-4"
                >
                  <div>
                    <h3 className="font-display text-fg text-xl font-normal tracking-tight">
                      {activeLayer.title}
                    </h3>
                    <p className="text-fg-muted mt-2 font-sans text-xs leading-relaxed">
                      {activeLayer.fullDesc}
                    </p>
                  </div>

                  {/* Telemetry Metrics */}
                  <div className="flex flex-col gap-2 border-t border-white/10 pt-2 font-mono text-xs">
                    {activeLayer.telemetry.map((t, idx) => (
                      <div
                        key={idx}
                        className="surface-well flex flex-col gap-0.5 rounded-lg border border-white/5 bg-black/40 p-2.5"
                      >
                        <span className="text-fg-subtle text-[9px] uppercase">{t.label}</span>
                        <span className="text-fg truncate text-[11px] font-bold">{t.value}</span>
                      </div>
                    ))}
                  </div>
                </m.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
