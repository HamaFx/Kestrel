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

// SPDX-License-Identifier: Apache-2.0

// Profile preferences action: display-name updates with rate limiting.
import { updateUserDisplayName, withRateLimit } from '@kestrel/db';
import { revalidatePath } from 'next/cache';

import { auth } from '@/auth';
import { logActionError } from '@/lib/http/action-errors';

import { NAME_MAX, NAME_MIN, type ActionResult } from './_actions-shared';

/**
 * Server action to update user profile.
 */
export async function updateProfileAction(formData: FormData): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Unauthorized' };
  }

  const rl = await withRateLimit(session.user.id, 'settings_update_profile', 10);
  if (!rl.allowed) {
    return { ok: false as const, error: 'Too many requests. Try again later.' };
  }

  const raw = formData.get('name');
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return {
      ok: false as const,
      error: `Name must be between ${NAME_MIN} and ${NAME_MAX} characters`,
    };
  }

  if (name === session.user.name) {
    revalidatePath('/settings/profile');
    return { ok: true as const };
  }

  try {
    await updateUserDisplayName(session.user.id, name);

    revalidatePath('/settings/profile');
    return { ok: true as const };
  } catch (err) {
    logActionError(err, 'settings-action');
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
