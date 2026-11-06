'use server';

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

// Onboarding reset action. Chat-model mutations are handled by their REST
// route + service; only the reset action still runs through a server action.

import { resetOnboarding, withUserTenant } from '@kestrel/db';
import { revalidatePath } from 'next/cache';

import { auth } from '@/auth';

import type { ActionResult } from './shared';

export async function resetOnboardingAction(
  options: { soft?: boolean } = {},
): Promise<ActionResult<{ reset: boolean }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: 'Not authenticated' };
  }

  try {
    // Canonical reset modes: `soft` clears completion + progress; `full` also
    // purges BYOK keys, watchlist symbols, and preferences (matching the
    // "Full Factory Reset" copy in the UI).
    await withUserTenant(session.user.id, () =>
      resetOnboarding(session.user.id, options.soft ? 'soft' : 'full'),
    );

    revalidatePath('/settings');
    revalidatePath('/onboarding');
    return { ok: true, data: { reset: true } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to reset onboarding' };
  }
}
