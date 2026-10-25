'use client';

// SPDX-License-Identifier: Apache-2.0

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

// Landing hero section shell. The ticker, headline copy and telemetry rig
// live in sibling presentation components; this file owns the active-symbol
// state and composes the section backdrop, columns and watermark.
import Image from 'next/image';
import { useState } from 'react';

import { HeroCopy } from './hero-copy';
import { HeroTelemetryRig } from './hero-telemetry-rig';
import { HeroTickerStrip } from './hero-ticker-strip';

export interface LandingHeroProps {
  isAuthenticated?: boolean;
}

export function LandingHero({ isAuthenticated = false }: LandingHeroProps) {
  const [activeSymbolIndex, setActiveSymbolIndex] = useState(0);

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
        <HeroTickerStrip />

        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:items-center lg:gap-8">
          {/* Left Column: Monumental Headline & Value Prop */}
          <HeroCopy isAuthenticated={isAuthenticated} />

          {/* Right Column: Interactive Hardware Telemetry Rig with 3D Hologram */}
          <HeroTelemetryRig
            activeSymbolIndex={activeSymbolIndex}
            onSelectSymbol={setActiveSymbolIndex}
          />
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
