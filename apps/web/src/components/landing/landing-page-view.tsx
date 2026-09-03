// SPDX-License-Identifier: Apache-2.0

'use client';

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

import { LandingNav } from './landing-nav';
import { LandingHero } from './landing-hero';
import { LandingDesks } from './landing-desks';
import { LandingSimulator } from './landing-simulator';
import { LandingStepper } from './landing-stepper';
import { LandingArchitecture } from './landing-architecture';
import { LandingFAQ } from './landing-faq';
import { LandingFooter } from './landing-footer';

export interface LandingPageViewProps {
  isAuthenticated?: boolean;
}

export function LandingPageView({ isAuthenticated = false }: LandingPageViewProps) {
  return (
    <div className="flex min-h-screen flex-col bg-[#101112] text-fg selection:bg-brand selection:text-white">
      <LandingNav isAuthenticated={isAuthenticated} />
      <main className="flex-1">
        <LandingHero isAuthenticated={isAuthenticated} />
        <LandingDesks />
        <LandingSimulator />
        <LandingStepper />
        <LandingArchitecture />
        <LandingFAQ />
      </main>
      <LandingFooter />
    </div>
  );
}
