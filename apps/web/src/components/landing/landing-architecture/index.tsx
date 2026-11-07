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

// Landing architecture section shell. The header marquee, layer tabs,
// isometric plates and telemetry console live in sibling components; this
// file owns the active/hovered layer state and composes the workbench.
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
      className="relative overflow-hidden border-t border-white/5 bg-[#0e0f10] py-28 lg:py-36"
    >
      {/* ── Arbiter Convergence Blueprint (raster backup preserved) ── */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-8 right-0 z-0 h-[360px] w-full opacity-35 select-none sm:top-12 sm:h-[480px] lg:top-1/2 lg:h-[85%] lg:w-[48%] lg:-translate-y-1/2"
      >
        <BlueprintPlate id="arbiter" showRasterBackup className="h-full w-full" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header with Concentric Rotating Marquee Badge */}
        <ArchitectureHeader />

        {/* ── 3D ISOMETRIC EXPLODED STACK WORKBENCH ── */}
        <div className="grid gap-12 lg:grid-cols-12 lg:items-center">
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
          <div className="order-3 flex items-center justify-center py-12 lg:order-2 lg:col-span-5 lg:py-0">
            <div
              className="relative h-[480px] w-[320px] select-none sm:w-[380px]"
              style={{
                perspective: '1200px',
                transformStyle: 'preserve-3d',
              }}
            >
              {/* 4 Floating 3D Isometric Plates with Dynamic Spring Separation Physics */}
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

          {/* Right Column: Active Layer Live Telemetry Console.
              On mobile it sits directly under the tabs (order-2) so tapping a
              layer updates content that is already on screen instead of
              updating a console ~500px below the fold. */}
          <div className="order-2 lg:order-3 lg:col-span-3">
            <ArchitectureTelemetryConsole activeLayer={activeLayer} />
          </div>
        </div>
      </div>
    </section>
  );
}
