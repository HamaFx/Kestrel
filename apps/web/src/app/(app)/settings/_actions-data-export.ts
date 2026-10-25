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

// Data-export action: password and 2FA gated, rate-limited export of all
// tenant-scoped user data as JSON. The payload builder lives in
// _actions-data-export-payload.ts.
import { getDb } from '@kestrel/ai';
import { schema, withRateLimit } from '@kestrel/db';
import { decryptSecret } from '@kestrel/shared/encryption';
import { eq } from 'drizzle-orm';
import { verifySync } from 'otplib';

import { auth } from '@/auth';
import { logActionError } from '@/lib/http/action-errors';

import { buildUserDataExport } from './_actions-data-export-payload';
import { verifyAccountPassword, type ActionResult } from './_actions-shared';

export async function exportDataAction(
  password?: string,
  totpCode?: string,
): Promise<ActionResult<string>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Unauthorized' };
  }

  // Require password verification for data export (3.6.1)
  if (!password || password.length < 8) {
    return { ok: false as const, error: 'Password is required to export your data' };
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

  if (user?.twoFactorEnabled) {
    if (!totpCode) {
      return { ok: false as const, error: '2FA code is required to export your data' };
    }
    const decryptedSecret = user.twoFactorSecret ? decryptSecret(user.twoFactorSecret) : null;
    if (!decryptedSecret || !verifySync({ secret: decryptedSecret, token: totpCode }).valid) {
      return { ok: false as const, error: 'Invalid 2FA code' };
    }
  }

  const passwordValid = await verifyAccountPassword(session.user.id, password);
  if (!passwordValid) {
    return { ok: false as const, error: 'Incorrect account password' };
  }

  const rl = await withRateLimit(session.user.id, 'settings_export', 3);
  if (!rl.allowed) {
    return { ok: false as const, error: 'Too many requests. Try again later.' };
  }

  try {
    const data = await buildUserDataExport(session.user.id);
    return {
      ok: true as const,
      data,
    };
  } catch (err) {
    logActionError(err, 'settings-action');
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
