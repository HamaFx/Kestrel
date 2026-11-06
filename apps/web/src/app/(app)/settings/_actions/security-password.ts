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

// Password-change action: current-password and optional 2FA gated rotation
// with token-version bump and audit logging.
//
// the `user` read/update below carries no RLS
// (migration 0039 disables it for `user`), but `createAuditLog` writes
// `audit_logs`, which is tenant-scoped — that insert runs inside
// `withUserTenant`.
import { createAuditLog, getDb, schema, withUserTenant } from '@kestrel/db';
import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auth } from '@/auth';
import { passwordSchema } from '@/lib/http/validation';

import { verifyAccountPassword, verifyUserTwoFactorIfEnabled, type ActionResult } from './shared';

/**
 * LOW-04: Change account password.
 */
export async function changePasswordAction(
  currentPassword: string,
  newPassword: string,
  totpCode?: string,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Unauthorized' };

  const passwordValid = await verifyAccountPassword(session.user.id, currentPassword);
  if (!passwordValid) return { ok: false, error: 'Current password is incorrect' };

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

  const parsedPassword = passwordSchema.safeParse(newPassword);
  if (!parsedPassword.success) {
    return { ok: false, error: parsedPassword.error.issues[0]?.message ?? 'Invalid password' };
  }

  const hashedPassword = await bcrypt.hash(newPassword, 12);
  await db
    .update(schema.users)
    .set({ hashedPassword, tokenVersion: sql`${schema.users.tokenVersion} + 1` })
    .where(eq(schema.users.id, session.user.id));

  // FEAT-03: Audit log for password changed. `audit_logs` is tenant-scoped
  // (audit 2026-10-31 R1), so the insert needs its own scope — the rest of
  // this action only touches the non-RLS `user` table.
  try {
    await withUserTenant(session.user.id, () =>
      createAuditLog(session.user.id, 'password_changed'),
    );
  } catch {
    /* fail open */
  }

  revalidatePath('/settings');
  return { ok: true };
}
