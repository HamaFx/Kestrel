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

// Landing architecture section shell: replaces the old 3D skewed stacked
// cards with the interactive Signal-Flow & 1% Risk Forcefield showcase.
import { useState } from 'react';

import { BlueprintPlate } from '@/components/brand/blueprint-plates';

import { ArchitectureConduitCanvas } from './architecture-conduit-canvas';
import { ArchitectureHeader } from './architecture-header';
import type { ConduitMode } from './layers';

export function LandingArchitecture() {
  const [mode, setMode] = useState<ConduitMode>('approved');

  return (
    <section
      id="architecture"
      className="relative overflow-hidden border-t border-white/5 bg-[#0e0f10] py-24 lg:py-32"
    >
      {/* Neoclassical Titan Sculpture Backdrop */}
      <div
        aria-hidden="true"
        className="architecture-backdrop-mask pointer-events-none absolute top-6 right-0 z-0 h-[260px] w-[72%] opacity-15 mix-blend-screen select-none sm:top-10 sm:h-[380px] sm:w-[60%] lg:top-12 lg:right-0 lg:h-[74%] lg:w-[44%] lg:opacity-22"
      >
        <BlueprintPlate id="titan" variant="watermark" className="h-full w-full" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <ArchitectureHeader mode={mode} onSelectMode={setMode} />
        <ArchitectureConduitCanvas mode={mode} />
      </div>
    </section>
  );
}
