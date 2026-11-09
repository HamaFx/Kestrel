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

// Landing architecture section shell. Presents the clean 3-pillar security &
// self-hosted overview (Encrypted API Keys, Multi-Provider Market Data,
// Private Workspace) and interactive 4-layer stack inspector.
import { useState } from 'react';

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
      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header + 3 Core Security & Self-Hosted Pillars */}
        <ArchitectureHeader />

        {/* ── INTERACTIVE 4-LAYER ARCHITECTURE WORKBENCH ── */}
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
          <div className="order-3 flex items-center justify-center py-12 lg:order-2 lg:col-span-4 lg:py-0">
            <div
              className="relative h-[480px] w-[320px] select-none sm:w-[360px]"
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

          {/* Right Column: Active Layer Security & Architecture Details */}
          <div className="order-2 lg:order-3 lg:col-span-4">
            <ArchitectureTelemetryConsole activeLayer={activeLayer} />
          </div>
        </div>
      </div>
    </section>
  );
}
