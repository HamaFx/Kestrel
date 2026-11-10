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

// Landing architecture section (#architecture). Presents the 4 sovereign
// infrastructure layers in a calm, open 4-column Swiss hairline grid over the
// chiaroscuro Titan backdrop—without moving/tappable 3D stacked cards.
import { BlueprintPlate } from '@/components/brand/blueprint-plates';
import { cn } from '@/lib/formatters/cn';

import { ArchitectureHeader } from './architecture-header';
import { LAYERS } from './layers';

export function LandingArchitecture() {
  const orderedLayers = [...LAYERS].reverse();

  return (
    <section
      id="architecture"
      className="relative overflow-hidden border-b border-white/[0.08] bg-[#121212] py-28 lg:py-36"
    >
      {/* Chiaroscuro Titan sculpture backdrop */}
      <div
        aria-hidden="true"
        className="architecture-backdrop-mask pointer-events-none absolute top-0 right-0 z-0 h-[340px] w-[88%] opacity-35 mix-blend-screen select-none sm:h-[440px] sm:w-[72%] lg:h-[640px] lg:w-[54%] lg:opacity-45"
      >
        <BlueprintPlate id="titan" variant="backdrop" className="h-full w-full" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <ArchitectureHeader />

        {/* Open 4-Column Sovereign Architecture Grid */}
        <div className="grid grid-cols-1 divide-y divide-white/[0.08] rounded-2xl border border-white/[0.08] bg-[#141517]/85 backdrop-blur-md md:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-y-0">
          {orderedLayers.map((layer) => {
            const LayerIcon = layer.icon;
            return (
              <article
                key={layer.id}
                className="flex flex-col justify-between p-7 transition-colors duration-200 hover:bg-white/[0.015] sm:p-9"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-brand font-mono text-xs font-bold tracking-wider uppercase">
                      {layer.num} // {layer.id}
                    </span>
                    <div className="icon-housing flex size-8 items-center justify-center rounded-lg">
                      <LayerIcon className={cn('size-4', layer.accentColor)} />
                    </div>
                  </div>

                  <h3 className="font-display text-fg mt-6 text-2xl font-normal tracking-tight">
                    {layer.title}
                  </h3>
                  <p className="text-fg-muted mt-2.5 font-sans text-sm leading-relaxed">
                    {layer.fullDesc}
                  </p>
                </div>

                <div className="mt-8 divide-y divide-white/[0.06] border-t border-white/[0.08] font-mono text-xs">
                  {layer.telemetry.map((spec) => (
                    <div key={spec.label} className="flex items-center justify-between gap-2 py-2.5">
                      <span className="text-fg-subtle text-[11px] uppercase">{spec.label}</span>
                      <span className="text-fg truncate font-semibold">{spec.value}</span>
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
