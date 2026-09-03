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
    <footer className="relative overflow-hidden bg-[#0a0a0a] pt-20 pb-12 border-t border-white/10">
      {/* ASCII Skyline Ambient Artwork */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-72 opacity-15 select-none bg-bottom bg-repeat-x"
        style={{ backgroundImage: 'url(/landing/ascii-art.webp)', backgroundSize: 'contain' }}
      />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Top Grid */}
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-8 pb-16 border-b border-white/10">
          {/* Brand & Mission */}
          <div className="flex flex-col items-start gap-4 lg:col-span-5">
            <KestrelBrand variant="lockup" href="/" label="Kestrel" />
            <p className="max-w-md font-sans text-sm leading-relaxed text-fg-muted">
              The sovereign AI committee for institutional gold and currency traders. Four autonomous specialist desks deliberating with mathematical precision.
            </p>
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-mono">
              <span className="size-2 rounded-full bg-bull shadow-[0_0_8px_#3f9e3d]" />
              <span className="text-fg-subtle uppercase tracking-wider">ALL SYSTEMS OPERATIONAL</span>
            </div>
          </div>

          {/* Links Column 1: Terminal */}
          <div className="flex flex-col gap-3 lg:col-span-2 sm:col-span-4">
            <h4 className="font-mono text-xs font-bold tracking-wider text-fg uppercase">
              Terminal
            </h4>
            <Link href="/chat" className="font-sans text-sm text-fg-muted hover:text-fg transition-colors">
              AI Committee Chat
            </Link>
            <Link href="/calendar" className="font-sans text-sm text-fg-muted hover:text-fg transition-colors">
              Economic Catalysts
            </Link>
            <Link href="/news" className="font-sans text-sm text-fg-muted hover:text-fg transition-colors">
              Macro Wires
            </Link>
            <Link href="/journal" className="font-sans text-sm text-fg-muted hover:text-fg transition-colors">
              Trade Journal
            </Link>
          </div>

          {/* Links Column 2: Specialist Desks */}
          <div className="flex flex-col gap-3 lg:col-span-3 sm:col-span-4">
            <h4 className="font-mono text-xs font-bold tracking-wider text-fg uppercase">
              Specialist Desks
            </h4>
            <span className="font-sans text-sm text-fg-muted">
              Technical Desk · SMC / FVG Analysis
            </span>
            <span className="font-sans text-sm text-fg-muted">
              Macro News Desk · Central Bank Yields
            </span>
            <span className="font-sans text-sm text-fg-muted">
              Risk Desk · 1% Mathematical Ceiling
            </span>
            <span className="font-sans text-sm text-fg-muted">
              Sentiment Desk · Institutional COT Flow
            </span>
          </div>

          {/* Links Column 3: Sovereign Security */}
          <div className="flex flex-col gap-3 lg:col-span-2 sm:col-span-4">
            <h4 className="font-mono text-xs font-bold tracking-wider text-fg uppercase">
              Security
            </h4>
            <span className="font-sans text-sm text-fg-muted">Non-Custodial</span>
            <span className="font-sans text-sm text-fg-muted">Zero Telemetry Leaks</span>
            <span className="font-sans text-sm text-fg-muted">Local AES-256 Storage</span>
            <span className="font-sans text-sm text-fg-muted">Audited Invalidation</span>
          </div>
        </div>

        {/* Monumental Watermark */}
        <div className="pt-12 pb-6 select-none opacity-20 hover:opacity-30 transition-opacity text-center overflow-hidden">
          <span className="font-bebas text-[80px] sm:text-[140px] md:text-[200px] leading-none tracking-widest text-white">
            KESTREL AI
          </span>
        </div>

        {/* Bottom Strip */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 text-xs text-fg-subtle font-mono border-t border-white/5">
          <span>© 2026 Kestrel Syndicate. All rights reserved.</span>
          <span>DISCLAIMER: NOT FINANCIAL ADVICE. FOR INSTITUTIONAL RESEARCH ONLY.</span>
        </div>
      </div>
    </footer>
  );
}
