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
    <footer className="relative overflow-hidden bg-[#0e0f11] pt-16 pb-12">
      {/* Subtle Pixelated ASCII Skyline Ambient Artwork */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-bottom bg-repeat-x opacity-15 select-none [image-rendering:pixelated]"
        style={{ backgroundImage: 'url(/landing/ascii-art.webp)', backgroundSize: 'contain' }}
      />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 border-b border-white/[0.08] pb-12 lg:grid-cols-12 lg:gap-8">
          {/* Brand & Mission */}
          <div className="flex flex-col items-start gap-3.5 lg:col-span-5">
            <KestrelBrand variant="lockup" href="/" label="Kestrel" />
            <p className="text-fg-muted max-w-sm font-sans text-sm leading-relaxed">
              Self-hosted BYOK AI trading research platform for XAU/USD, 11 Forex pairs, and 6
              Crypto pairs.
            </p>
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 font-mono text-[11px]">
              <span className="bg-bull size-2 rounded-full shadow-[0_0_8px_#3f9e3d]" />
              <span className="text-fg-subtle tracking-wider uppercase">
                4 DESKS ONLINE · BYOK VAULT ACTIVE
              </span>
            </div>
          </div>

          {/* Links Column 1: Terminal */}
          <div className="flex flex-col gap-2.5 sm:col-span-4 lg:col-span-2">
            <h4 className="text-fg font-mono text-xs font-bold tracking-wider uppercase">
              Terminal
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
              4-Desk Chat
            </Link>
            <Link
              href="/calendar"
              className="text-fg-muted hover:text-fg font-sans text-sm transition-colors"
            >
              Macro Calendar
            </Link>
            <Link
              href="/journal"
              className="text-fg-muted hover:text-fg font-sans text-sm transition-colors"
            >
              Trade Journal
            </Link>
          </div>

          {/* Links Column 2: Committee */}
          <div className="flex flex-col gap-2.5 sm:col-span-4 lg:col-span-3">
            <h4 className="text-fg font-mono text-xs font-bold tracking-wider uppercase">
              4-Desk Committee
            </h4>
            <span className="text-fg-muted font-sans text-sm">01 · Macro &amp; Real Yields</span>
            <span className="text-fg-muted font-sans text-sm">02 · Multi-Timeframe Structure</span>
            <span className="text-fg-muted font-sans text-sm">03 · 1.0% Equity Risk Governor</span>
            <span className="text-fg-muted font-sans text-sm">04 · CFTC COT Positioning</span>
          </div>

          {/* Links Column 3: Sovereign Stack */}
          <div className="flex flex-col gap-2.5 sm:col-span-4 lg:col-span-2">
            <h4 className="text-fg font-mono text-xs font-bold tracking-wider uppercase">
              Architecture
            </h4>
            <span className="text-fg-muted font-sans text-sm">AES-256-GCM BYOK</span>
            <span className="text-fg-muted font-sans text-sm">PostgreSQL 16 RLS</span>
            <span className="text-fg-muted font-sans text-sm">TOTP 2FA Auth</span>
            <span className="text-fg-muted font-sans text-sm">Non-Custodial</span>
          </div>
        </div>

        {/* Monumental Watermark */}
        <div className="overflow-hidden pt-10 pb-4 text-center opacity-15 transition-opacity select-none hover:opacity-25">
          <span className="font-bebas text-[76px] leading-none tracking-widest text-white sm:text-[136px] md:text-[188px]">
            KESTREL AI
          </span>
        </div>

        {/* Bottom Strip */}
        <div className="text-fg-subtle flex flex-col items-center justify-between gap-4 border-t border-white/[0.06] pt-6 font-mono text-xs sm:flex-row">
          <span>© 2026 Kestrel. All rights reserved.</span>
          <span>NOT FINANCIAL ADVICE · FOR MARKET RESEARCH &amp; EDUCATION ONLY</span>
        </div>
      </div>
    </footer>
  );
}
