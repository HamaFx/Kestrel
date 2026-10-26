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

import { Link } from 'next-view-transitions';

import { KestrelBrand } from '@/components/brand/kestrel-brand';

export function LandingFooter() {
  return (
    <footer className="relative overflow-hidden border-t border-white/10 bg-[#0a0a0a] pt-20 pb-12">
      {/* ASCII Skyline Ambient Artwork */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-bottom bg-repeat-x opacity-15 select-none"
        style={{ backgroundImage: 'url(/landing/ascii-art.webp)', backgroundSize: 'contain' }}
      />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Top Grid */}
        <div className="grid gap-12 border-b border-white/10 pb-16 lg:grid-cols-12 lg:gap-8">
          {/* Brand & Mission */}
          <div className="flex flex-col items-start gap-4 lg:col-span-5">
            <KestrelBrand variant="lockup" href="/" label="Kestrel" />
            <p className="text-fg-muted max-w-md font-sans text-sm leading-relaxed">
              The AI market research and trade-planning copilot for gold, forex, and crypto traders.
              Four specialist desks working in parallel to protect your edge.
            </p>
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-xs">
              <span className="bg-bull size-2 rounded-full shadow-[0_0_8px_#3f9e3d]" />
              <span className="text-fg-subtle tracking-wider uppercase">
                ALL SYSTEMS OPERATIONAL
              </span>
            </div>
          </div>

          {/* Links Column 1: Platform */}
          <div className="flex flex-col gap-3 sm:col-span-4 lg:col-span-2">
            <h4 className="text-fg font-mono text-xs font-bold tracking-wider uppercase">
              Platform
            </h4>
            <Link
              href="/dashboard"
              className="text-fg-muted hover:text-fg font-sans text-sm transition-colors"
            >
              Market Dashboard
            </Link>
            <Link
              href="/chat"
              className="text-fg-muted hover:text-fg font-sans text-sm transition-colors"
            >
              AI Committee Chat
            </Link>
            <Link
              href="/calendar"
              className="text-fg-muted hover:text-fg font-sans text-sm transition-colors"
            >
              Economic Calendar
            </Link>
            <Link
              href="/journal"
              className="text-fg-muted hover:text-fg font-sans text-sm transition-colors"
            >
              Trade Journal
            </Link>
          </div>

          {/* Links Column 2: Specialist Desks */}
          <div className="flex flex-col gap-3 sm:col-span-4 lg:col-span-3">
            <h4 className="text-fg font-mono text-xs font-bold tracking-wider uppercase">
              Specialist Desks
            </h4>
            <span className="text-fg-muted font-sans text-sm">
              Technical Desk · Price Structure & Levels
            </span>
            <span className="text-fg-muted font-sans text-sm">
              Macro Desk · Central Banks & Yields
            </span>
            <span className="text-fg-muted font-sans text-sm">
              Risk Desk · 1% Drawdown Guardrail
            </span>
            <span className="text-fg-muted font-sans text-sm">
              Sentiment Desk · Institutional COT Flow
            </span>
          </div>

          {/* Links Column 3: Security & Trust */}
          <div className="flex flex-col gap-3 sm:col-span-4 lg:col-span-2">
            <h4 className="text-fg font-mono text-xs font-bold tracking-wider uppercase">
              Trust & Safety
            </h4>
            <span className="text-fg-muted font-sans text-sm">100% Non-Custodial</span>
            <span className="text-fg-muted font-sans text-sm">AES-256 BYOK Vault</span>
            <span className="text-fg-muted font-sans text-sm">Private Trade Journal</span>
            <span className="text-fg-muted font-sans text-sm">Instant Multi-Channel Alerts</span>
          </div>
        </div>

        {/* Monumental Watermark */}
        <div className="overflow-hidden pt-12 pb-6 text-center opacity-20 transition-opacity select-none hover:opacity-30">
          <span className="font-bebas text-[80px] leading-none tracking-widest text-white sm:text-[140px] md:text-[200px]">
            KESTREL AI
          </span>
        </div>

        {/* Bottom Strip */}
        <div className="text-fg-subtle flex flex-col items-center justify-between gap-4 border-t border-white/5 pt-6 font-mono text-xs sm:flex-row">
          <span>© 2026 Kestrel. All rights reserved.</span>
          <span>DISCLAIMER: NOT FINANCIAL ADVICE. FOR MARKET RESEARCH & EDUCATION ONLY.</span>
        </div>
      </div>
    </footer>
  );
}
