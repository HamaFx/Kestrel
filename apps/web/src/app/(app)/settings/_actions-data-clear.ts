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

// Clear-chat-history action: rate-limited deletion of all AI chat threads
// owned by the signed-in user.
import { deleteAllThreads } from '@kestrel/ai';
import { withRateLimit } from '@kestrel/db';

import { auth } from '@/auth';
import { logActionError } from '@/lib/http/action-errors';

import { type ActionResult } from './_actions-shared';

/**
 * Server action to delete all chat history.
 */
export async function clearChatHistoryAction(): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false as const,
      error: 'Unauthorized',
    };
  }

  const rl = await withRateLimit(session.user.id, 'settings_clear_chat', 5);
  if (!rl.allowed) {
    return { ok: false as const, error: 'Too many requests. Try again later.' };
  }

  try {
    await deleteAllThreads(session.user.id);
    return { ok: true as const };
  } catch (err) {
    logActionError(err, 'settings-action');
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
