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
import { motion, AnimatePresence } from 'motion/react';
import {
  IconCpu,
  IconShieldLock,
  IconBolt,
  IconScale,
  IconCheck,
  IconArrowsSplit,
  IconLock,
} from '@tabler/icons-react';
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
    title: 'Cryptographic FIX Bridge & TP Cones',
    shortDesc: 'Asymmetric order tickets with verified take-profit cones.',
    fullDesc:
      'Every approved trading plan is stamped with a SHA-256 cryptographic ticket hash and dispatched via low-latency encrypted webhooks to MetaTrader, cTrader, or custom FIX 4.4 bridges.',
    accentColor: 'text-bull',
    borderColor: 'border-bull/40',
    glowColor: 'rgba(63, 158, 61, 0.3)',
    icon: IconArrowsSplit,
    telemetry: [
      { label: 'DISPATCH PROTOCOL', value: 'FIX 4.4 / MT5 Bridge' },
      { label: 'CONE RATIOS', value: '1:1.5 · 1:2.5 · 1:4.0 R:R' },
      { label: 'SIGNING ALGO', value: 'SHA-256 Cryptographic Ticket' },
    ],
  },
  {
    id: 'risk',
    num: '03',
    tag: 'SAFETY GOVERNOR LAYER',
    title: '1.0% Mathematical Risk & Invalidation Firewall',
    shortDesc: 'Immutable portfolio ceiling with instant veto authority.',
    fullDesc:
      'The risk desk enforces an unbreachable 1.0% portfolio drawdown ceiling. If volatility models or ATR invalidation stops require greater than 1% account risk, execution is mathematically vetoed.',
    accentColor: 'text-warn',
    borderColor: 'border-warn/40',
    glowColor: 'rgba(235, 140, 31, 0.3)',
    icon: IconScale,
    telemetry: [
      { label: 'PORTFOLIO CEILING', value: '≤ 1.0% Max Loss' },
      { label: 'MIN EXPECTED VALUE', value: '≥ 1:2.5 Risk/Reward' },
      { label: 'VETO ENFORCEMENT', value: 'Instant Disputed Signal Abort' },
    ],
  },
  {
    id: 'deliberation',
    num: '02',
    tag: 'CONSENSUS SYNDICATE LAYER',
    title: '4-Desk Multi-Agent Deliberation Sandbox',
    shortDesc: 'Four specialized models evaluating independent dimensions.',
    fullDesc:
      'Four autonomous specialist agents run in parallel sandboxes: SMC Technicals scans Fair Value Gaps, Central Bank Macro parses rates, Risk computes volatility stops, and Whale Sentiment queries CFTC positioning.',
    accentColor: 'text-brand',
    borderColor: 'border-brand/40',
    glowColor: 'rgba(255, 54, 22, 0.35)',
    icon: IconCpu,
    telemetry: [
      { label: 'PARALLEL ENGINES', value: '4 Concurrent Sandboxes' },
      { label: 'ARBITRATION ENGINE', value: 'Weighted Confidence Scoring' },
      { label: 'MODEL ENSEMBLE', value: 'Sonnet 3.7 + DeepSeek-R1' },
    ],
  },
  {
    id: 'ingestion',
    num: '01',
    tag: 'FOUNDATION DATA LAYER',
    title: 'Multi-Venue Interbank Ingestion Mesh',
    shortDesc: 'Sub-18ms tick synthesis across global FX and gold liquidity.',
    fullDesc:
      'Aggregates raw institutional L2 order books across London Fix, New York AM/PM Killzones, and Tokyo sessions, cross-referenced against US 2Y/10Y Treasury yield spreads and DXY index velocity.',
    accentColor: 'text-info',
    borderColor: 'border-info/40',
    glowColor: 'rgba(38, 126, 224, 0.3)',
    icon: IconBolt,
    telemetry: [
      { label: 'INGESTION LATENCY', value: '< 18ms Sub-Second Index' },
      { label: 'PRIMARY PAIRS', value: 'XAU/USD · EUR · GBP · DXY' },
      { label: 'MACRO SIGNALS', value: 'US10Y / US02Y Yield Spreads' },
    ],
  },
];

export function LandingArchitecture() {
  const [activeLayerId, setActiveLayerId] = useState<string>('risk');
  const activeLayer = LAYERS.find((l) => l.id === activeLayerId) ?? LAYERS[1]!;

  return (
    <section id="architecture" className="relative py-28 bg-[#0e0f10] border-t border-white/5 overflow-hidden">
      {/* Background Halftone Columns & Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-1/3 opacity-15 select-none bg-contain bg-no-repeat bg-left"
        style={{ backgroundImage: 'url(/landing/faq-halftone-columns.png)' }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 right-1/4 size-[700px] rounded-full bg-brand/5 blur-[160px] select-none"
      />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header with Concentric Rotating Marquee Badge */}
        <div className="flex flex-col items-center text-center gap-4 mb-20">
          {/* Dual Concentric Circular Rotating SVG Marquee */}
          <div className="relative size-32 sm:size-40 flex items-center justify-center mb-2 select-none">
            <svg
              viewBox="0 0 400 400"
              className="absolute inset-0 size-full animate-[spin_32s_linear_infinite] text-fg-subtle text-[11px] font-mono tracking-[0.22em] uppercase opacity-70"
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
              className="absolute inset-0 size-full animate-[spin_24s_linear_infinite_reverse] text-brand text-[10px] font-mono tracking-[0.18em] uppercase opacity-85"
            >
              <defs>
                <path
                  id="circle-inner"
                  d="M 200 200 m -120 0 a 120 120 0 1 1 240 0 a 120 120 0 1 1 -240 0"
                />
              </defs>
              <text fill="currentColor">
                <textPath href="#circle-inner" startOffset="0%">
                  • 1.0% VETO FIREWALL • SUB-18MS FIX BRIDGE •
                </textPath>
              </text>
            </svg>

            <div className="size-14 rounded-full surface-chip bg-[#18191a] border border-white/20 flex items-center justify-center text-brand shadow-[0_0_16px_rgba(255,54,22,0.4)]">
              <IconLock className="size-6 text-brand" />
            </div>
          </div>

          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-mono">
            <span className="size-2 rounded-full bg-brand animate-pulse" />
            <span className="text-brand font-semibold uppercase tracking-wider">
              Exploded 3D Architecture
            </span>
          </div>

          <h2 className="font-display text-3xl font-normal tracking-[-0.03em] text-fg sm:text-5xl max-w-2xl">
            ENGINEERED AS AN{' '}
            <span className="font-redaction-35 italic text-brand">Unbreakable Stack</span>
          </h2>
          <p className="font-sans text-sm sm:text-base text-fg-muted max-w-xl leading-relaxed">
            Every layer in Kestrel operates as an isolated cryptographic boundary. Select any level in the 3D stack below to inspect its operational telemetry.
          </p>
        </div>

        {/* ── 3D ISOMETRIC EXPLODED STACK WORKBENCH ── */}
        <div className="grid gap-12 lg:grid-cols-12 lg:items-center">
          {/* Left Column: Layer Selector Tabs */}
          <div className="lg:col-span-4 flex flex-col gap-3">
            {LAYERS.map((layer) => {
              const isActive = layer.id === activeLayerId;
              const Icon = layer.icon;
              return (
                <button
                  key={layer.id}
                  type="button"
                  onClick={() => setActiveLayerId(layer.id)}
                  className={cn(
                    'group relative flex items-start gap-4 rounded-xl p-4 sm:p-5 text-left transition-all duration-200 border',
                    isActive
                      ? 'surface-chip bg-[#171819] border-white/20 shadow-[var(--shadow-chip)]'
                      : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10',
                  )}
                >
                  {/* Active Indicator Top Line */}
                  {isActive && (
                    <motion.div
                      layoutId="active-iso-tab-indicator"
                      className="absolute inset-0 rounded-xl border border-brand/40 bg-brand/[0.03] -z-10"
                      transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                    />
                  )}

                  <div
                    className={cn(
                      'flex size-10 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold transition-colors border',
                      isActive
                        ? 'bg-brand text-white border-brand shadow-[0_0_12px_rgba(255,54,22,0.4)]'
                        : 'bg-black/40 border-white/10 text-fg-subtle group-hover:text-fg',
                    )}
                  >
                    {layer.num}
                  </div>

                  <div className="flex flex-col gap-1 w-full">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] font-bold text-brand uppercase tracking-wider">
                        {layer.tag}
                      </span>
                      <Icon className={cn('size-4', isActive ? layer.accentColor : 'text-fg-subtle')} />
                    </div>
                    <h3 className="font-display text-base font-normal tracking-tight text-fg group-hover:text-white">
                      {layer.title}
                    </h3>
                    <p className="font-sans text-xs text-fg-muted leading-relaxed">
                      {layer.shortDesc}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Center Column: Interactive 3D Exploded Isometric Stack Projection */}
          <div className="lg:col-span-5 flex items-center justify-center py-10 lg:py-0">
            <div
              className="relative w-[320px] sm:w-[380px] h-[460px] select-none"
              style={{ perspective: '1200px' }}
            >
              {/* 4 Floating 3D Isometric Plates */}
              {LAYERS.slice().reverse().map((layer, index) => {
                const isActive = layer.id === activeLayerId;
                // Layer vertical distribution
                const baseTopPercent = index * 26 + 6;
                const LayerIcon = layer.icon;

                return (
                  <motion.div
                    key={layer.id}
                    onClick={() => setActiveLayerId(layer.id)}
                    animate={{
                      y: isActive ? -22 : 0,
                      scale: isActive ? 1.05 : 0.98,
                    }}
                    transition={{ type: 'spring', stiffness: 350, damping: 26 }}
                    className="absolute inset-x-0 cursor-pointer group"
                    style={{
                      top: `${baseTopPercent}%`,
                      zIndex: isActive ? 40 : 10 + index,
                    }}
                  >
                    {/* The Isometric Silicon/Glass Plate with Mathematical Angles */}
                    <div
                      className={cn(
                        'relative aspect-[354/195] w-full rounded-2xl transition-all duration-300 border backdrop-blur-md shadow-2xl flex flex-col justify-between p-5',
                        isActive
                          ? 'bg-[#18191b]/95 border-brand/60 shadow-[0_20px_50px_rgba(255,54,22,0.25),inset_0_1px_1px_rgba(255,255,255,0.2)]'
                          : 'bg-[#111213]/80 border-white/10 hover:border-white/20 hover:bg-[#141516]/90 shadow-[0_12px_32px_rgba(0,0,0,0.6)]',
                      )}
                      style={{
                        transform: 'rotate(30deg) skewX(-30deg) scaleY(0.866025)',
                        transformStyle: 'preserve-3d',
                      }}
                    >
                      {/* Silicon Micro-Traces within Plate */}
                      <div className="flex items-center justify-between border-b border-white/10 pb-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              'size-2 rounded-full',
                              isActive ? 'bg-brand animate-pulse shadow-[0_0_8px_#ff3616]' : 'bg-white/20',
                            )}
                          />
                          <span className="font-mono text-[10px] font-bold text-fg-subtle uppercase tracking-wider">
                            LAYER {layer.num} // {layer.id.toUpperCase()}
                          </span>
                        </div>
                        <LayerIcon className={cn('size-4', isActive ? layer.accentColor : 'text-fg-subtle')} />
                      </div>

                      {/* Middle Circuit Graphic inside Plate */}
                      <div className="flex items-center justify-between font-mono text-[10px]">
                        <span className={cn('font-bold tracking-wider', isActive ? 'text-fg' : 'text-fg-subtle')}>
                          {layer.title}
                        </span>
                        {isActive && (
                          <span className="text-brand font-bold bg-brand/10 border border-brand/30 px-1.5 py-0.5 rounded text-[9px]">
                            ACTIVE STACK FOCUS
                          </span>
                        )}
                      </div>

                      {/* Bottom Edge Spec Indicator */}
                      <div className="flex items-center justify-between text-[9px] font-mono text-fg-subtle border-t border-white/5 pt-1.5">
                        <span>IMMUTABLE ISOLATION</span>
                        <span className="text-bull">STABLE · 100%</span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Active Layer Live Telemetry Console */}
          <div className="lg:col-span-3">
            <div className="surface-panel rounded-2xl border border-white/15 bg-[#121314] p-6 shadow-2xl flex flex-col gap-5">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-brand animate-pulse shadow-[0_0_8px_#ff3616]" />
                  <span className="font-mono text-[10px] font-bold text-brand uppercase tracking-wider">
                    LAYER {activeLayer.num} TELEMETRY
                  </span>
                </div>
                <span className="font-mono text-[10px] text-fg-subtle">ISOLATED</span>
              </div>

              <div>
                <h3 className="font-display text-xl font-normal tracking-tight text-fg">
                  {activeLayer.title}
                </h3>
                <p className="mt-2 font-sans text-xs leading-relaxed text-fg-muted">
                  {activeLayer.fullDesc}
                </p>
              </div>

              {/* Telemetry Metrics */}
              <div className="flex flex-col gap-2.5 pt-2 border-t border-white/10 font-mono text-xs">
                {activeLayer.telemetry.map((t, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg surface-well p-2.5 bg-black/40 border border-white/5 flex flex-col gap-0.5"
                  >
                    <span className="text-[10px] text-fg-subtle">{t.label}</span>
                    <span className="font-bold text-fg">{t.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
