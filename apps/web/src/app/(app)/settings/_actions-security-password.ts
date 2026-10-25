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
import { createAuditLog, getDb, schema } from '@kestrel/db';
import { decryptSecret } from '@kestrel/shared/encryption';
import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { verifySync } from 'otplib';

import { auth } from '@/auth';
import { passwordSchema } from '@/lib/http/validation';

import { verifyAccountPassword, type ActionResult } from './_actions-shared';

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

  if (user?.twoFactorEnabled) {
    if (!totpCode) return { ok: false, error: '2FA code is required' };
    const secret = user.twoFactorSecret ? decryptSecret(user.twoFactorSecret) : null;
    if (!secret || !verifySync({ secret, token: totpCode }).valid) {
      return { ok: false, error: 'Invalid 2FA code' };
    }
  }

  const parsedPassword = passwordSchema.safeParse(newPassword);
  if (!parsedPassword.success) {
    return { ok: false, error: parsedPassword.error.issues[0]?.message ?? 'Invalid password' };
  }

  const hashedPassword = await bcrypt.hash(newPassword, 12);
  await db
    .update(schema.users)
    .set({ hashedPassword, tokenVersion: sql`${schema.users.tokenVersion} + 1` })
    .where(eq(schema.users.id, session.user.id));

  // FEAT-03: Audit log for password changed
  try {
    await createAuditLog(session.user.id, 'password_changed');
  } catch {
    /* fail open */
  }

  revalidatePath('/settings');
  return { ok: true };
}
