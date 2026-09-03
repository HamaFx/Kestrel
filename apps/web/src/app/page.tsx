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

// SPDX-License-Identifier: Apache-2.0

import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { LandingNav } from '@/components/landing/landing-nav';
import { LandingHero } from '@/components/landing/landing-hero';
import { LandingStepper } from '@/components/landing/landing-stepper';
import { LandingArchitecture } from '@/components/landing/landing-architecture';
import { LandingFAQ } from '@/components/landing/landing-faq';
import { LandingFooter } from '@/components/landing/landing-footer';

export default async function RootPage() {
  let session = null;
  try {
    session = await auth();
  } catch (err) {
    console.warn('[RootPage] auth() check failed or unconfigured, rendering showcase:', err);
  }

  // Authenticated users go straight into the live terminal
  if (session?.user) {
    redirect('/chat');
  }

  // Public visitors see the full Hoplite-grade showcase
  return (
    <div className="flex min-h-screen flex-col bg-[#121212] text-fg selection:bg-brand selection:text-white">
      <LandingNav />
      <main className="flex-1">
        <LandingHero />
        <LandingStepper />
        <LandingArchitecture />
        <LandingFAQ />
      </main>
      <LandingFooter />
    </div>
  );
}
