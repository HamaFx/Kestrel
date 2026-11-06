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

// API-keys import/export actions: password + 2FA gated encrypted backup
// transfer of the user's BYOK payload.
//
// server actions run outside the page's tenant scope.
// The direct `user` reads below (2FA gate, password hash) carry no RLS
// (migration 0039); every `user_settings` access is scoped with
// `withUserTenant`.
import {
  getDb,
  mergeUserByokKeys,
  readUserByokState,
  schema,
  withRateLimit,
  withUserTenant,
} from '@kestrel/db';
import { decryptWithPassword, encryptWithPassword, PROVIDER_IDS } from '@kestrel/shared/encryption';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auth } from '@/auth';
import { logActionError } from '@/lib/http/action-errors';

import { verifyAccountPassword, verifyUserTwoFactorIfEnabled, type ActionResult } from './shared';

/**
 * Server action to export user API keys.
 * Encrypts the user's saved BYOK payload with a password.
 */
export async function exportKeysAction(
  password: string,
  totpCode?: string,
): Promise<ActionResult<{ payload: string }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Unauthorized' };
  }

  if (!password || password.length < 8) {
    return { ok: false as const, error: 'Password must be at least 8 characters' };
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

  // Verify password against account credentials
  const passwordValid = await verifyAccountPassword(session.user.id, password);
  if (!passwordValid) {
    return { ok: false as const, error: 'Incorrect account password' };
  }

  const rl = await withRateLimit(session.user.id, 'settings_export_keys', 3);
  if (!rl.allowed) {
    return { ok: false as const, error: 'Too many requests. Try again later.' };
  }

  try {
    // scope the vault read. Unscoped under `kestrel_app`
    // this row is invisible and the export would look empty.
    const state = await withUserTenant(session.user.id, (db) =>
      readUserByokState(session.user.id, db),
    );
    if (Object.keys(state.keys).length === 0) {
      return { ok: false as const, error: 'No keys configured to export' };
    }

    // Encrypt with the user password
    const backupPayload = encryptWithPassword(state.keys, password);

    return { ok: true as const, data: { payload: backupPayload } };
  } catch (err) {
    logActionError(err, 'settings-action');
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Server action to import user API keys.
 * Decrypts the backup payload with a password and saves to user settings.
 */
export async function importKeysAction(
  payload: string,
  password: string,
): Promise<ActionResult<{ importedCount: number }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Unauthorized' };
  }

  if (!payload || !password) {
    return { ok: false as const, error: 'Payload and password are required' };
  }

  // Verify password against account credentials
  const passwordValid = await verifyAccountPassword(session.user.id, password);
  if (!passwordValid) {
    return { ok: false as const, error: 'Incorrect account password' };
  }

  const rl = await withRateLimit(session.user.id, 'settings_import_keys', 5);
  if (!rl.allowed) {
    return { ok: false as const, error: 'Too many requests. Try again later.' };
  }

  try {
    const decryptedKeys = decryptWithPassword(payload, password) as Record<string, unknown>;
    if (!decryptedKeys || typeof decryptedKeys !== 'object') {
      return { ok: false as const, error: 'Invalid backup payload or incorrect password' };
    }

    const validKeys: Record<string, string> = {};
    // Backups may carry the finnhub market-data key alongside the chat
    // providers.
    for (const id of [...PROVIDER_IDS, 'finnhub'] as const) {
      const val = decryptedKeys[id];
      if (typeof val === 'string' && val.trim().length > 0) {
        validKeys[id] = val.trim();
      }
    }

    if (Object.keys(validKeys).length === 0) {
      return { ok: false as const, error: 'No valid keys found in backup payload' };
    }

    // the write must share the user's tenant scope.
    // A restore replaces the vault, carrying the market-data key forward when
    // the backup predates it.
    const merged = await withUserTenant(session.user.id, () =>
      mergeUserByokKeys(session.user.id, {
        set: validKeys,
        replace: true,
        preserve: ['finnhub'],
      }),
    );

    revalidatePath('/settings/api-keys');
    return { ok: true as const, data: { importedCount: Object.keys(merged.keys).length } };
  } catch (err) {
    logActionError(err, 'settings-action');
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
