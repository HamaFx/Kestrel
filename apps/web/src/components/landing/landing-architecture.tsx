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

import { IconCpu, IconShieldLock, IconBolt, IconScale, IconCheck } from '@tabler/icons-react';

const PILLARS = [
  {
    icon: IconCpu,
    tag: 'COGNITIVE ARBITRATION',
    title: 'Multi-Agent Sandbox Syndicate',
    description:
      'Four specialized algorithmic agents run in isolated memory sandboxes. Each desk evaluates distinct price action, macroeconomic wires, risk limits, and CFTC whale flows before submitting hypotheses to the lead arbiter.',
    stat: '4 Isolated Sandboxes',
    microVisual: (
      <div className="flex items-center justify-between gap-1 p-2 rounded-lg bg-black/40 border border-white/5 font-mono text-[10px]">
        <span className="px-1.5 py-0.5 rounded bg-bull/10 text-bull">Tech</span>
        <span className="text-fg-subtle">+</span>
        <span className="px-1.5 py-0.5 rounded bg-info/10 text-info">Macro</span>
        <span className="text-fg-subtle">+</span>
        <span className="px-1.5 py-0.5 rounded bg-warn/10 text-warn">Risk</span>
        <span className="text-fg-subtle">→</span>
        <span className="px-2 py-0.5 rounded bg-brand text-white font-bold">Arbiter</span>
      </div>
    ),
  },
  {
    icon: IconScale,
    tag: 'MATHEMATICAL RISK GOVERNOR',
    title: 'Strict 1% Portfolio Ceiling',
    description:
      'Every trade setup must satisfy an immutable mathematical risk constraint. If the computed ATR invalidation stop implies >1.0% account loss or fails to yield at least 1:2.5+ R:R, the plan is immediately vetoed.',
    stat: '100% Invalidation Veto',
    microVisual: (
      <div className="flex items-center justify-between p-2 rounded-lg bg-black/40 border border-white/5 font-mono text-[11px]">
        <span className="text-fg-subtle">MAX DRAWDOWN:</span>
        <span className="text-warn font-bold">≤ 1.0% AUM</span>
        <span className="text-fg-subtle">MIN R:R:</span>
        <span className="text-bull font-bold">≥ 1:2.5</span>
      </div>
    ),
  },
  {
    icon: IconBolt,
    tag: 'SUB-SECOND DATA PIPELINE',
    title: 'Multi-Venue Tick Synthesis',
    description:
      'Zero-delay tick ingestion synthesizing Spot Gold (XAU), Major FX pairs (EUR, GBP, JPY), US Treasury yields (2Y, 10Y), and Dollar Index (DXY) with real-time liquidity sweep detection.',
    stat: '< 18ms Processing Latency',
    microVisual: (
      <div className="flex items-center justify-between p-2 rounded-lg bg-black/40 border border-white/5 font-mono text-[10px]">
        <span className="text-fg-subtle">LONDON FIX: <strong className="text-fg">14ms</strong></span>
        <span className="text-fg-subtle">·</span>
        <span className="text-fg-subtle">NY KILLZONE: <strong className="text-fg">18ms</strong></span>
        <span className="text-fg-subtle">·</span>
        <span className="text-fg-subtle">TOKYO: <strong className="text-fg">24ms</strong></span>
      </div>
    ),
  },
  {
    icon: IconShieldLock,
    tag: 'SOVEREIGN NON-CUSTODIAL',
    title: 'Zero Custody · AES-256 Vault',
    description:
      'Your trading capital remains exclusively with your own broker. Kestrel never takes custody of assets, never makes discretionary trades without review, and encrypts all trade journals locally with AES-256-GCM.',
    stat: '0.0% Custody Exposure',
    microVisual: (
      <div className="flex items-center justify-between p-2 rounded-lg bg-black/40 border border-white/5 font-mono text-[11px]">
        <span className="text-bull flex items-center gap-1">
          <IconCheck className="size-3.5" /> NON-CUSTODIAL
        </span>
        <span className="text-fg-subtle">ENCRYPTION:</span>
        <span className="text-fg font-bold">AES-256-GCM</span>
      </div>
    ),
  },
];

export function LandingArchitecture() {
  return (
    <section id="architecture" className="relative py-24 bg-[#121314]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col items-start gap-4 mb-16 max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-mono">
            <span className="size-2 rounded-full bg-brand" />
            <span className="text-brand font-semibold uppercase tracking-wider">
              Institutional Infrastructure
            </span>
          </div>

          <h2 className="font-display text-3xl font-normal tracking-[-0.03em] text-fg sm:text-5xl">
            ENGINEERED FOR{' '}
            <span className="font-redaction-35 italic text-brand">Zero Compromise</span>
          </h2>
          <p className="font-sans text-base text-fg-muted leading-relaxed">
            Designed from the ground up for high-net-worth sovereign traders who demand mathematical precision, rapid execution, and absolute privacy.
          </p>
        </div>

        {/* 4 Pillars Grid */}
        <div className="grid gap-6 md:grid-cols-2">
          {PILLARS.map((pillar) => {
            const Icon = pillar.icon;
            return (
              <div
                key={pillar.title}
                className="surface-chip relative flex flex-col justify-between rounded-2xl border border-white/10 bg-[#161718] p-7 sm:p-8 transition-all duration-200 hover:border-brand/40 shadow-[var(--shadow-chip)]"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex size-12 items-center justify-center rounded-xl bg-brand/10 border border-brand/20 text-brand">
                      <Icon className="size-6" />
                    </div>
                    <span className="font-mono text-xs font-bold text-fg-subtle uppercase tracking-wider">
                      {pillar.tag}
                    </span>
                  </div>

                  <h3 className="mt-6 font-display text-2xl font-normal tracking-tight text-fg">
                    {pillar.title}
                  </h3>

                  <p className="mt-2.5 font-sans text-sm leading-relaxed text-fg-muted">
                    {pillar.description}
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-white/5 flex flex-col gap-3">
                  {pillar.microVisual}
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-brand font-semibold">{pillar.stat}</span>
                    <span className="size-1.5 rounded-full bg-brand" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
