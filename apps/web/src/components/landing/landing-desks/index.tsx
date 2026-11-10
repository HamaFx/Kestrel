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

// "Inside the 4 Specialist Desks" section (#desks). Uses an open 4-column
// Swiss hairline grid with minimalist optical SVGs and zero nested box clutter.
import { BlueprintPlate } from '@/components/brand/blueprint-plates';

import { DeskConsole } from './desk-console';
import { DESKS } from './desks';

export function LandingDesks() {
  return (
    <section
      id="desks"
      className="relative overflow-hidden border-b border-white/[0.08] bg-[#121212] py-28 lg:py-36"
    >
      {/* Chiaroscuro council sculpture backdrop */}
      <div
        aria-hidden="true"
        className="desks-backdrop-mask pointer-events-none absolute top-4 left-0 z-0 h-[320px] w-[88%] opacity-35 mix-blend-screen select-none sm:h-[420px] sm:w-[72%] lg:top-0 lg:left-0 lg:h-[85%] lg:w-[50%] lg:opacity-45"
      >
        <BlueprintPlate id="sentinel" variant="backdrop" className="h-full w-full" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Spacious Section Header */}
        <div className="mb-16 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <div className="text-brand mb-3 font-mono text-xs font-semibold tracking-[0.14em] uppercase">
              01 · PARALLEL SPECIALIST COMMITTEE
            </div>
            <h2 className="font-display text-fg text-3xl font-normal tracking-[-0.02em] sm:text-5xl">
              Four Specialist Desks.{' '}
              <span className="font-redaction-35 text-brand italic">Zero Blind Spots.</span>
            </h2>
          </div>
          <p className="text-fg-muted max-w-md font-sans text-base leading-relaxed">
            Every query runs across four domain-isolated AI desks before the numeric verifier locks
            in your entry, invalidation, and position size.
          </p>
        </div>

        {/* Open 4-Column Architectural Hairline Grid */}
        <div className="grid grid-cols-1 divide-y divide-white/[0.08] rounded-2xl border border-white/[0.08] bg-[#141517]/85 backdrop-blur-md md:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-y-0">
          {DESKS.map((desk) => (
            <DeskConsole key={desk.id} desk={desk} />
          ))}
        </div>
      </div>
    </section>
  );
}
