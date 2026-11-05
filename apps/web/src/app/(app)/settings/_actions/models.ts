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
import 'server-only';

// Audit 2026-10-31 (R1): server actions run outside the page's tenant scope.
// `user_settings` has RLS, so every helper call below is wrapped in
// `withUserTenant` — the helper's own getDb() then resolves the scoped client.
//
// Phase 3 Task 3 — `updateChatModelAction` now calls the same
// `validateAndSaveUserModel` service as `PUT /api/settings/chat-model`
// (API-key ownership + catalog membership + embedding-tier rejection), and
// `resetOnboardingAction` delegates to the canonical `resetOnboarding` modes
// instead of re-implementing the reset with inline SQL.
import { resetOnboarding, updateUserSettingsField, withUserTenant } from '@kestrel/db';
import type { ProviderId } from '@kestrel/shared/encryption';
import { revalidatePath } from 'next/cache';

import { auth } from '@/auth';
import { validateAndSaveUserModel } from '@/lib/services/settings';

import type { ActionResult } from './shared';

export async function updateChatModelAction(
  providerId: ProviderId,
  modelId: string,
): Promise<ActionResult<{ chatModel: string | null }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: 'Not authenticated' };
  }

  try {
    const { model } = await withUserTenant(session.user.id, () =>
      validateAndSaveUserModel(session.user.id, 'chat', providerId, modelId),
    );
    revalidatePath('/settings');
    return { ok: true, data: { chatModel: model } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to update chat model' };
  }
}

export async function clearChatModelAction(): Promise<ActionResult<{ chatModel: null }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: 'Not authenticated' };
  }

  try {
    await withUserTenant(session.user.id, () =>
      updateUserSettingsField(session.user.id, 'chatModel', null),
    );
    revalidatePath('/settings');
    return { ok: true, data: { chatModel: null } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to reset chat model' };
  }
}

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
    // "Full Factory Reset" copy in the UI, which the previous inline SQL
    // never actually did).
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
