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
import { getDb } from '@kestrel/ai';
import { requireTenantIdForUser, schema, withRateLimit } from '@kestrel/db';
import {
  decryptByok,
  decryptSecret,
  decryptWithPassword,
  encryptByok,
  encryptWithPassword,
  JEV_PROVIDER_IDS,
  PROVIDER_IDS,
} from '@kestrel/shared/encryption';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { verifySync } from 'otplib';

import { auth } from '@/auth';
import { logActionError } from '@/lib/http/action-errors';

import { verifyAccountPassword, type ActionResult } from './_actions-shared';

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

  if (user?.twoFactorEnabled) {
    if (!totpCode) {
      return { ok: false as const, error: '2FA code is required' };
    }
    const decryptedSecret = user.twoFactorSecret ? decryptSecret(user.twoFactorSecret) : null;
    if (!decryptedSecret || !verifySync({ secret: decryptedSecret, token: totpCode }).valid) {
      return { ok: false as const, error: 'Invalid 2FA code' };
    }
  }

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
    const db = getDb();
    const tenantId = await requireTenantIdForUser(session.user.id, db);
    const [settings] = await db
      .select({ aiApiKeys: schema.userSettings.aiApiKeys })
      .from(schema.userSettings)
      .where(
        and(
          eq(schema.userSettings.userId, session.user.id),
          eq(schema.userSettings.tenantId, tenantId),
        ),
      );

    const encryptedPayload = settings?.aiApiKeys;
    if (!encryptedPayload) {
      return { ok: false as const, error: 'No keys configured to export' };
    }

    const decrypted = decryptByok(encryptedPayload);
    if (!decrypted || Object.keys(decrypted).length === 0) {
      return { ok: false as const, error: 'No keys configured to export' };
    }

    // Encrypt with the user password
    const backupPayload = encryptWithPassword(decrypted, password);

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
    // Decision 4A — backups may carry the decision-model keys and the finnhub
    // market-data key alongside the chat providers.
    for (const id of [...PROVIDER_IDS, ...JEV_PROVIDER_IDS, 'finnhub'] as const) {
      const val = decryptedKeys[id];
      if (typeof val === 'string' && val.trim().length > 0) {
        validKeys[id] = val.trim();
      }
    }
    const importedIds = new Set(Object.keys(validKeys));

    if (Object.keys(validKeys).length === 0) {
      return { ok: false as const, error: 'No valid keys found in backup payload' };
    }

    const db = getDb();
    const tenantId = await requireTenantIdForUser(session.user.id, db);

    // Preservation invariant: a backup written before the decision-model
    // keys existed must not wipe the stored ones on import — carry them
    // forward when the backup does not carry its own.
    const [oldSettings] = await db
      .select({
        aiApiKeys: schema.userSettings.aiApiKeys,
        aiApiKeysUpdatedAt: schema.userSettings.aiApiKeysUpdatedAt,
      })
      .from(schema.userSettings)
      .where(
        and(
          eq(schema.userSettings.userId, session.user.id),
          eq(schema.userSettings.tenantId, tenantId),
        ),
      );
    const oldDecrypted = oldSettings?.aiApiKeys ? decryptByok(oldSettings.aiApiKeys) : null;
    const oldUpdatedAt = oldSettings?.aiApiKeysUpdatedAt ?? {};
    for (const id of [...JEV_PROVIDER_IDS, 'finnhub'] as const) {
      const existing = oldDecrypted?.[id];
      if (existing && !validKeys[id]) validKeys[id] = existing;
    }

    const now = new Date().toISOString();
    const newUpdatedAt: Record<string, string> = {};
    for (const id of Object.keys(validKeys)) {
      // Imported keys are marked now; carried-forward decision/market-data
      // keys keep their original change time.
      newUpdatedAt[id] = importedIds.has(id) ? now : (oldUpdatedAt[id] ?? now);
    }

    await db
      .update(schema.userSettings)
      .set({
        aiApiKeys: encryptByok(validKeys),
        aiApiKeysUpdatedAt: newUpdatedAt,
      })
      .where(
        and(
          eq(schema.userSettings.userId, session.user.id),
          eq(schema.userSettings.tenantId, tenantId),
        ),
      );

    revalidatePath('/settings/api-keys');
    return { ok: true as const, data: { importedCount: Object.keys(validKeys).length } };
  } catch (err) {
    logActionError(err, 'settings-action');
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
