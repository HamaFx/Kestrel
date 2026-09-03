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

import type { Metadata } from 'next';

import { auth } from '@/auth';
import { LandingPageView } from '@/components/landing/landing-page-view';

export const metadata: Metadata = {
  title: 'Kestrel | The Apex AI Committee for Institutional Gold & Forex',
  description:
    'Four autonomous specialist desks synthesize price action structure, macro rate catalysts, 1% risk governance, and institutional COT positioning into a unified market verdict.',
};

export default async function LandingPage() {
  let session = null;
  try {
    session = await auth();
  } catch (err) {
    console.warn('[LandingPage] auth() session lookup error:', err);
  }

  return <LandingPageView isAuthenticated={!!session?.user} />;
}
