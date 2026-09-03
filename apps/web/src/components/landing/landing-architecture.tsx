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

import { IconCpu, IconShieldLock, IconBolt, IconScale } from '@tabler/icons-react';

const PILLARS = [
  {
    icon: IconCpu,
    tag: 'COGNITIVE ENGINE',
    title: 'Mastra Multi-Agent Syndicate',
    description: 'Four specialized LLM-powered algorithmic agents run concurrently in isolated sandbox runtimes. Each desk evaluates independent datasets before submitting formal hypotheses to the lead arbiter.',
    stat: '4 Sandbox Workers',
  },
  {
    icon: IconScale,
    tag: 'RISK GOVERNOR',
    title: 'Strict 1% Portfolio Ceiling',
    description: 'Every trade setup must pass an immutable mathematical risk threshold. If the computed ATR invalidation stop exceeds 1.0% portfolio drawdown or lacks a 1:2.5+ R:R, the plan is vetoed.',
    stat: '100% Invalidation Veto',
  },
  {
    icon: IconBolt,
    tag: 'DATA PIPELINE',
    title: 'Sub-Second Venue Synthesis',
    description: 'Low-latency ingestion synthesizing Spot Gold (XAU), Major FX pairs (EUR, GBP, JPY), US Treasury yields (2Y, 10Y), and Dollar Index (DXY) with real-time liquidity imbalance detection.',
    stat: '< 200ms Latency',
  },
  {
    icon: IconShieldLock,
    tag: 'SOVEREIGN SECURITY',
    title: 'Non-Custodial Architecture',
    description: 'Your capital remains strictly in your own broker. Kestrel never takes custody of funds, never executes discretionary trades without review, and enforces local AES-256 journal encryption.',
    stat: '0.0% Custody Exposure',
  },
];

export function LandingArchitecture() {
  return (
    <section id="architecture" className="relative py-24 bg-[#121212]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col items-start gap-4 mb-16 max-w-3xl">
          <span className="font-mono text-xs font-semibold tracking-wider text-brand uppercase">
            Institutional Infrastructure
          </span>
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
                className="surface-chip relative flex flex-col justify-between rounded-2xl border border-white/10 bg-[#161616] p-7 transition-all duration-200 hover:border-brand/40 shadow-[var(--shadow-chip)]"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex size-11 items-center justify-center rounded-xl bg-brand/10 border border-brand/20 text-brand">
                      <Icon className="size-6" />
                    </div>
                    <span className="font-mono text-xs font-bold text-fg-subtle uppercase tracking-wider">
                      {pillar.tag}
                    </span>
                  </div>

                  <h3 className="mt-6 font-display text-xl font-normal tracking-tight text-fg">
                    {pillar.title}
                  </h3>

                  <p className="mt-2 font-sans text-sm leading-relaxed text-fg-muted">
                    {pillar.description}
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between">
                  <span className="font-mono text-xs text-brand font-semibold">
                    {pillar.stat}
                  </span>
                  <span className="size-1.5 rounded-full bg-brand/60" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
