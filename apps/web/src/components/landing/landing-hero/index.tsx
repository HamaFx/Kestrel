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

// Landing hero section shell. The ticker, headline copy and kinetic SVG
// telemetry rig live in sibling presentation components; this file owns the
// active-symbol state and composes the Swiss-grid section frame.
import { useState } from 'react';

import { BlueprintPlate } from '@/components/brand/blueprint-plates';

import { HeroCopy } from './hero-copy';
import { HeroTelemetryRig } from './hero-telemetry-rig';
import { HeroTickerStrip } from './hero-ticker-strip';

export interface LandingHeroProps {
  isAuthenticated?: boolean;
}

const REGISTRATION_MARKS = [
  'top-3 left-3 sm:left-5 lg:left-7',
  'top-3 right-3 sm:right-5 lg:right-7',
  'bottom-3 left-3 sm:left-5 lg:left-7',
  'bottom-3 right-3 sm:right-5 lg:right-7',
] as const;

export function LandingHero({ isAuthenticated = false }: LandingHeroProps) {
  const [activeSymbolIndex, setActiveSymbolIndex] = useState(0);

  return (
    <section className="relative overflow-hidden border-b border-white/[0.07] bg-[#121212] pt-6 pb-16 lg:pt-10 lg:pb-24">
      {/* Bayer-dithered chiaroscuro sculpture backdrop */}
      <div
        aria-hidden="true"
        className="hero-backdrop-mask pointer-events-none absolute top-8 right-0 z-0 h-[300px] w-[88%] opacity-30 mix-blend-screen select-none sm:h-[400px] sm:w-[72%] lg:top-6 lg:right-0 lg:h-[88%] lg:w-[54%] lg:opacity-42"
      >
        <BlueprintPlate id="horus" variant="backdrop" className="h-full w-full" />
      </div>

      {/* Structural column hairlines */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-px bg-white/[0.04] lg:block"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/[0.04]"
      />
      {REGISTRATION_MARKS.map((position) => (
        <span
          key={position}
          aria-hidden="true"
          className={`text-fg-subtle/30 pointer-events-none absolute z-20 font-mono text-xs select-none ${position}`}
        >
          +
        </span>
      ))}

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <HeroTickerStrip />

        <div className="relative grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-center lg:gap-8 lg:border-x lg:border-white/[0.05] lg:px-6 xl:px-8">
          <HeroCopy isAuthenticated={isAuthenticated} />
          <HeroTelemetryRig
            activeSymbolIndex={activeSymbolIndex}
            onSelectSymbol={setActiveSymbolIndex}
          />
        </div>
      </div>
    </section>
  );
}
