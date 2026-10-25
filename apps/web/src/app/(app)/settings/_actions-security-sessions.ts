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

// Session actions: list active sessions, revoke one, and sign out everywhere.
import {
  deleteUserSessions as dbDeleteUserSessions,
  listUserSessions as dbListUserSessions,
  revokeUserSession as dbRevokeUserSession,
  incrementTokenVersion,
  withRateLimit,
} from '@kestrel/db';
import { revalidatePath } from 'next/cache';

import { auth } from '@/auth';
import { logActionError } from '@/lib/http/action-errors';

import { type ActionResult } from './_actions-shared';

export async function listSessionsAction(): Promise<
  ActionResult<{
    sessions: Array<{
      id: string;
      deviceName: string | null;
      ip: string | null;
      createdAt: Date;
      lastActiveAt: Date;
    }>;
    currentSessionId: string | null;
  }>
> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Unauthorized' };
  }

  try {
    const rows = await dbListUserSessions(session.user.id);
    const currentSessionId = (session as { sessionId?: string }).sessionId ?? null;

    return { ok: true as const, data: { sessions: rows, currentSessionId } };
  } catch (err) {
    logActionError(err, 'settings-action');
    return { ok: false as const, error: 'Failed to load sessions' };
  }
}

export async function revokeSessionAction(sessionId: string): Promise<ActionResult> {
  const authSession = await auth();
  if (!authSession?.user?.id) {
    return { ok: false as const, error: 'Unauthorized' };
  }

  const rl = await withRateLimit(authSession.user.id, 'settings_revoke_session', 10);
  if (!rl.allowed) {
    return { ok: false as const, error: 'Too many requests. Try again later.' };
  }

  try {
    await dbRevokeUserSession(sessionId, authSession.user.id);

    revalidatePath('/settings');
    return { ok: true as const };
  } catch (err) {
    logActionError(err, 'settings-action');
    return { ok: false as const, error: 'Failed to revoke session' };
  }
}

export async function signOutEverywhereAction(): Promise<ActionResult> {
  const authSession = await auth();
  if (!authSession?.user?.id) {
    return { ok: false as const, error: 'Unauthorized' };
  }

  const rl = await withRateLimit(authSession.user.id, 'settings_signout_everywhere', 2);
  if (!rl.allowed) {
    return { ok: false as const, error: 'Too many requests. Try again later.' };
  }

  try {
    await dbDeleteUserSessions(authSession.user.id);
    await incrementTokenVersion(authSession.user.id);

    revalidatePath('/settings');
    return { ok: true as const };
  } catch (err) {
    logActionError(err, 'settings-action');
    return { ok: false as const, error: 'Failed to sign out everywhere' };
  }
}
