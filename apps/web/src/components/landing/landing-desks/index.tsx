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

// "Inside the 4 Specialist Desks" 2x2 SVG Bento Grid section. Replaces the
// multi-box tab wall with four simultaneous hardware cards and bespoke 1px SVG
// schematics.
import { useState } from 'react';

import { BlueprintPlate } from '@/components/brand/blueprint-plates';

import { DeskConsole } from './desk-console';
import { DeskTabs } from './desk-tabs';
import { DESKS } from './desks';

export function LandingDesks() {
  const [activeDesk, setActiveDesk] = useState(0);

  return (
    <section
      id="desks"
      className="relative overflow-hidden border-b border-white/[0.07] bg-[#121212] py-20 lg:py-28"
    >
      {/* Bayer-dithered chiaroscuro council backdrop */}
      <div
        aria-hidden="true"
        className="section-backdrop-mask pointer-events-none absolute top-6 left-0 z-0 h-[260px] w-[85%] opacity-22 mix-blend-screen select-none sm:h-[340px] sm:w-[70%] lg:top-0 lg:left-0 lg:h-[78%] lg:w-[46%] lg:opacity-30"
      >
        <BlueprintPlate id="sentinel" variant="backdrop" className="h-full w-full" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Concise Section Header */}
        <div className="mb-10 flex flex-col justify-between gap-4 border-b border-white/[0.07] pb-7 lg:flex-row lg:items-end">
          <div>
            <div className="text-brand mb-2.5 flex items-center gap-2 font-mono text-xs tracking-[0.14em] uppercase">
              <span>// 01 · PARALLEL SPECIALIST COMMITTEE</span>
            </div>
            <h2 className="font-display text-fg text-3xl font-normal tracking-[-0.02em] sm:text-5xl">
              Four Specialist Desks.{' '}
              <span className="font-redaction-35 text-brand italic">Zero Blind Spots.</span>
            </h2>
          </div>
          <p className="text-fg-muted max-w-md font-sans text-sm leading-relaxed sm:text-base">
            Every query runs across four domain-isolated AI desks before the numeric verifier locks
            in your entry, invalidation, and position size.
          </p>
        </div>

        {/* Interactive Focus Bar */}
        <DeskTabs activeDesk={activeDesk} onSelectDesk={setActiveDesk} />

        {/* 2x2 Hardware Bento Grid */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {DESKS.map((desk, idx) => (
            <DeskConsole
              key={desk.id}
              desk={desk}
              isSelected={activeDesk === idx}
              onSelect={() => setActiveDesk(idx)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
