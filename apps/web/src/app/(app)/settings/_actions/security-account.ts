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

// Account-deletion action: password and optional 2FA gated soft delete that
// scrubs PII, revokes sessions, and signs the user out.
//
// `deleteUserAccount` purges tenant-scoped tables
// (user_settings, chat_threads, alerts, user_symbols, …), all with RLS.
// Unscoped under `kestrel_app` each DELETE would silently match zero rows, so
// the purge runs inside `withUserTenant`. The `user` read before it has no RLS.
import { deleteUserAccount, getDb, schema, withRateLimit, withUserTenant } from '@kestrel/db';
import { eq } from 'drizzle-orm';

import { auth, signOut } from '@/auth';
import { logActionError } from '@/lib/http/action-errors';

import { verifyAccountPassword, verifyUserTwoFactorIfEnabled, type ActionResult } from './shared';

/**
 * P1-4: Soft-delete user account. Sets deletedAt, bumps tokenVersion to
 * invalidate all sessions, nulls out PII, revokes sessions, and signs out.
 * Requires password + 2FA confirmation. A purge job handles permanent
 * deletion later.
 */
export async function deleteAccountAction(
  password: string,
  totpCode?: string,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Unauthorized' };
  }

  if (!password) {
    return { ok: false as const, error: 'Password is required' };
  }

  // Check 2FA if enabled
  const db = getDb();
  const [user] = await db
    .select({
      twoFactorEnabled: schema.users.twoFactorEnabled,
      twoFactorSecret: schema.users.twoFactorSecret,
    })
    .from(schema.users)
    .where(eq(schema.users.id, session.user.id));

  const twoFactorError = verifyUserTwoFactorIfEnabled(user ?? {}, totpCode);
  if (twoFactorError) return twoFactorError;

  const passwordValid = await verifyAccountPassword(session.user.id, password);
  if (!passwordValid) {
    return { ok: false as const, error: 'Incorrect password' };
  }

  const rl = await withRateLimit(session.user.id, 'settings_delete_account', 2);
  if (!rl.allowed) {
    return { ok: false as const, error: 'Too many requests. Try again later.' };
  }

  try {
    // run the purge inside the user's tenant scope so
    // the RLS-protected deletes actually remove their rows.
    await withUserTenant(session.user.id, () => deleteUserAccount(session.user.id));
    await signOut({ redirectTo: '/' });
    return { ok: true as const };
  } catch (err) {
    logActionError(err, 'settings-action');
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
