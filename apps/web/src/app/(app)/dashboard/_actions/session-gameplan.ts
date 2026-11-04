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

// Lock in the pre-session gameplan. The dashboard drawer calls this action so
// the risk policy is persisted where the AI risk context can read it.

import type { SessionGameplan } from '@kestrel/shared';

import { auth } from '@/auth';
import { logActionError } from '@/lib/http/action-errors';
import { saveSessionGameplanService } from '@/lib/services/session-gameplan';

export type SaveSessionGameplanResult =
  | { ok: true; plan: SessionGameplan }
  | { ok: false; error: string };

export async function saveSessionGameplanAction(
  input: SessionGameplan,
): Promise<SaveSessionGameplanResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Unauthorized' };

  try {
    const plan = await saveSessionGameplanService(session.user.id, input);
    return { ok: true, plan };
  } catch (err) {
    logActionError(err, 'session-gameplan');
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
