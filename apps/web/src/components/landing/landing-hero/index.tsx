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

// Landing hero section shell. Composes the multi-market ticker strip,
// headline copy, and the live multi-asset motion stage with the Horus
// classical sculpture backdrop.
import { BlueprintPlate } from '@/components/brand/blueprint-plates';

import { HeroCopy } from './hero-copy';
import { HeroTelemetryRig } from './hero-telemetry-rig';
import { HeroTickerStrip } from './hero-ticker-strip';

export interface LandingHeroProps {
  isAuthenticated?: boolean;
}

export function LandingHero({ isAuthenticated = false }: LandingHeroProps) {
  return (
    <section className="relative overflow-hidden border-b border-white/[0.08] pt-6 pb-16 lg:pt-10 lg:pb-24">
      {/* Ambient Horus classical sculpture backdrop framing the right column */}
      <div
        aria-hidden="true"
        className="hero-backdrop-mask pointer-events-none absolute top-6 right-0 z-0 h-[280px] w-[78%] opacity-22 mix-blend-screen select-none sm:top-10 sm:h-[380px] sm:w-[70%] lg:top-1/2 lg:right-[10%] lg:h-[84%] lg:w-[52%] lg:-translate-y-1/2 lg:opacity-35"
      >
        <BlueprintPlate id="horus" variant="watermark" className="h-full w-full" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <HeroTickerStrip />

        <div className="relative grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-center lg:gap-10">
          <HeroCopy isAuthenticated={isAuthenticated} />
          <HeroTelemetryRig />
        </div>
      </div>
    </section>
  );
}
