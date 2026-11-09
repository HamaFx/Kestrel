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

// Landing architecture section shell (#architecture). Presents the interactive
// 4-layer sovereign stack inspector with isometric plates and SVG schematics.
import { useState } from 'react';

import { BlueprintPlate } from '@/components/brand/blueprint-plates';

import { ArchitectureHeader } from './architecture-header';
import { ArchitectureLayerPlate } from './architecture-layer-plate';
import { ArchitectureLayerTab } from './architecture-layer-tab';
import { ArchitectureTelemetryConsole } from './architecture-telemetry-console';
import { LAYERS } from './layers';

export function LandingArchitecture() {
  const [activeLayerId, setActiveLayerId] = useState<string>('risk');
  const [hoveredLayerId, setHoveredLayerId] = useState<string | null>(null);

  const effectiveId = hoveredLayerId ?? activeLayerId;
  const activeIndex = LAYERS.findIndex((l) => l.id === effectiveId);
  const activeLayer = LAYERS[activeIndex >= 0 ? activeIndex : 1]!;

  return (
    <section
      id="architecture"
      className="relative overflow-hidden border-b border-white/[0.07] bg-[#121212] py-20 lg:py-28"
    >
      {/* Bayer-dithered chiaroscuro titan backdrop */}
      <div
        aria-hidden="true"
        className="architecture-backdrop-mask pointer-events-none absolute top-0 right-0 z-0 h-[280px] w-[85%] opacity-22 mix-blend-screen select-none sm:h-[380px] sm:w-[70%] lg:h-[600px] lg:w-[52%] lg:opacity-32"
      >
        <BlueprintPlate id="titan" variant="backdrop" className="h-full w-full" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <ArchitectureHeader />

        {/* Interactive 4-Layer Architecture Workbench */}
        <div className="grid gap-10 lg:grid-cols-12 lg:items-center">
          {/* Left Column: Layer Selector Tabs */}
          <div className="order-1 flex flex-col gap-3 lg:order-1 lg:col-span-4">
            {LAYERS.map((layer) => (
              <ArchitectureLayerTab
                key={layer.id}
                layer={layer}
                isActive={layer.id === activeLayerId}
                onActivate={() => setActiveLayerId(layer.id)}
                onHoverStart={() => setHoveredLayerId(layer.id)}
                onHoverEnd={() => setHoveredLayerId(null)}
              />
            ))}
          </div>

          {/* Center Column: Interactive 3D Exploded Isometric Stack Projection */}
          <div className="order-3 flex items-center justify-center py-10 lg:order-2 lg:col-span-4 lg:py-0">
            <div
              className="relative h-[460px] w-[320px] select-none sm:w-[360px]"
              style={{
                perspective: '1200px',
                transformStyle: 'preserve-3d',
              }}
            >
              {LAYERS.map((layer, index) => (
                <ArchitectureLayerPlate
                  key={layer.id}
                  layer={layer}
                  index={index}
                  activeIndex={activeIndex}
                  isActive={layer.id === effectiveId}
                  onActivate={() => setActiveLayerId(layer.id)}
                  onHoverStart={() => setHoveredLayerId(layer.id)}
                  onHoverEnd={() => setHoveredLayerId(null)}
                />
              ))}
            </div>
          </div>

          {/* Right Column: Active Layer SVG Subsystem Schematic & Specs */}
          <div className="order-2 lg:order-3 lg:col-span-4">
            <ArchitectureTelemetryConsole activeLayer={activeLayer} />
          </div>
        </div>
      </div>
    </section>
  );
}
