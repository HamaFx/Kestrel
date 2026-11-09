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

// SPDX-License-Identifier: Apache-2.0

// Split auth gateway: credential column on the left (immediately visible above
// the fold on mobile without decorative banners), and a calm Kestrel feature
// summary + sample analysis preview on desktop.
import {
  IconArrowLeft,
  IconChartCandle,
  IconKey,
  IconShieldCheck,
  IconSparkles,
} from '@tabler/icons-react';
import type { Metadata } from 'next';
import { Link } from 'next-view-transitions';

import { KestrelBrand } from '@/components/brand/kestrel-brand';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Kestrel account',
};

const FEATURE_PILLARS = [
  {
    icon: IconChartCandle,
    title: '18 Supported Markets across Gold, Forex & Crypto',
    description:
      'Live streaming quotes, multi-timeframe structure, and macro context for XAUUSD, 11 major FX pairs, and 6 crypto markets.',
  },
  {
    icon: IconSparkles,
    title: 'Clear 4-Angle AI Trade Analysis',
    description:
      'Technical, Fundamental, Risk, and Sentiment specialist desks collaborate and verify every level before presenting a thesis.',
  },
  {
    icon: IconKey,
    title: 'Private Encrypted API Key Vault',
    description:
      'Bring your own OpenAI, Anthropic, Gemini, or OpenRouter keys — encrypted at rest with local spend guardrails.',
  },
] as const;

const SAMPLE_DESKS = [
  { name: 'Technical', read: 'PDH reclaim · 4H EMA stack aligned', bias: 'BULLISH' },
  { name: 'Fundamental', read: 'US10Y −4.2 bps · DXY softening', bias: 'BULLISH' },
  { name: 'Risk', read: '1.00% max risk · ATR-14 stop placement', bias: 'GUARDED' },
  { name: 'Sentiment', read: 'COT net +18.4K · retail skewed short', bias: 'BULLISH' },
] as const;

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="bg-bg text-fg relative min-h-svh overflow-hidden lg:grid lg:grid-cols-12">
      {/* ── Credential column ── */}
      <section className="relative z-10 flex min-h-svh flex-col justify-between p-6 sm:p-10 lg:col-span-5 lg:border-r lg:border-white/[0.08]">
        <div className="flex items-center justify-between gap-4">
          <KestrelBrand variant="lockup" href="/landing" />
          <Link
            href="/landing"
            className="text-fg-subtle hover:text-fg inline-flex items-center gap-1.5 font-mono text-xs transition-colors active:translate-y-[0.5px]"
          >
            <IconArrowLeft className="text-brand size-3.5" />
            <span className="hidden sm:inline">Back to Kestrel</span>
          </Link>
        </div>

        <h1 className="sr-only">Kestrel</h1>
        <div className="mx-auto w-full max-w-sm py-8 lg:py-10">{children}</div>

        <p className="text-fg-subtle text-xs">Encrypted API Key Vault · Private &amp; Self-Hosted</p>
      </section>

      {/* ── Feature summary column (Desktop) ── */}
      <aside className="relative hidden overflow-hidden border-l border-white/[0.06] bg-[#0c0d0f] p-10 lg:col-span-7 lg:flex lg:flex-col lg:justify-between xl:p-12">
        <div className="relative z-10 flex items-center justify-between gap-4">
          <span className="text-fg-subtle font-mono text-[11px] tracking-[0.16em] uppercase">
            AI Trading Research Platform
          </span>
          <span className="border-border/60 text-fg-subtle rounded-md border px-2.5 py-0.5 font-mono text-[11px]">
            Self-Hosted · BYOK
          </span>
        </div>

        <div className="relative z-10 my-auto flex max-w-xl flex-col gap-6 self-center">
          {/* Feature summary card */}
          <div className="surface-panel rounded-2xl border border-white/[0.1] bg-[#121315]/90 p-6 shadow-2xl">
            <p className="text-brand mb-1.5 font-mono text-[11px] font-semibold tracking-wider uppercase">
              Built for Disciplined Market Research
            </p>
            <h2 className="font-display text-fg mb-5 text-xl font-normal tracking-[-0.02em]">
              Four specialist AI perspectives in one calm workspace.
            </h2>

            <div className="flex flex-col gap-4">
              {FEATURE_PILLARS.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div key={feature.title} className="flex items-start gap-3.5">
                    <span className="surface-well text-brand mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/10">
                      <Icon className="size-4" />
                    </span>
                    <div className="flex flex-col gap-0.5">
                      <h3 className="text-fg text-sm font-semibold">{feature.title}</h3>
                      <p className="text-fg-subtle text-xs leading-relaxed">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Calm sample analysis card */}
          <div className="w-full rounded-2xl border border-white/[0.08] bg-[#121315]/80 p-5 shadow-xl">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div className="flex items-center gap-2">
                <span className="bg-bull size-2 rounded-full" />
                <span className="text-fg text-xs font-semibold">
                  Sample XAUUSD 4-Angle Summary
                </span>
              </div>
              <span className="text-brand border-brand/30 bg-brand/10 rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold">
                4 / 4 Verified
              </span>
            </div>

            <div className="divide-y divide-white/[0.06]">
              {SAMPLE_DESKS.map((desk) => (
                <div
                  key={desk.name}
                  className="grid grid-cols-[100px_1fr_auto] items-center gap-3 py-2.5"
                >
                  <span className="text-fg text-xs font-medium">{desk.name}</span>
                  <span className="text-fg-muted min-w-0 truncate text-xs">{desk.read}</span>
                  <span
                    className={
                      desk.bias === 'GUARDED'
                        ? 'border-warn/30 bg-warn/10 text-warn rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold'
                        : 'border-bull/30 bg-bull/10 text-bull rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold'
                    }
                  >
                    {desk.bias}
                  </span>
                </div>
              ))}
            </div>

            <div className="border-brand/25 bg-brand/[0.05] mt-3 flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
              <span className="text-fg-muted flex items-center gap-1.5 text-xs">
                <IconShieldCheck className="text-brand size-4" />
                Default Risk Guardrail
              </span>
              <span className="text-brand font-mono text-xs font-bold tabular-nums">
                1.00% per trade
              </span>
            </div>
          </div>
        </div>

        <p className="text-fg-subtle relative z-10 text-xs">
          Illustrative analysis preview · Not financial advice
        </p>
      </aside>
    </main>
  );
}
