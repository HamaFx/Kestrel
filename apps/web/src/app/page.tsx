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
import { LandingPageView } from '@/components/landing/landing-page-view';
import { MotionRoot } from '@/components/ui/motion-config';

export default async function RootPage({
  searchParams,
}: {
  searchParams?: Promise<{ showcase?: string }>;
}) {
  const resolvedParams = searchParams ? await searchParams : undefined;
  let session = null;
  try {
    session = await auth();
  } catch (err) {
    console.warn('[RootPage] auth() check failed or unconfigured, rendering showcase:', err);
  }

  // Authenticated users go straight into the live terminal unless they explicitly requested the showcase
  if (session?.user && resolvedParams?.showcase !== 'true') {
    redirect('/chat');
  }

  // Public visitors (or authenticated visitors requesting the showcase) see the full Hoplite showcase
  return (
    <MotionRoot>
      <LandingPageView isAuthenticated={!!session?.user} />
    </MotionRoot>
  );
}

