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

// Shared types, constants, and helpers used by the settings domain action files.
// Imported by each domain file to avoid circular dependencies and duplication.

import { getUserPasswordHash } from '@kestrel/db';
import { decryptSecret } from '@kestrel/shared/encryption';
import bcrypt from 'bcryptjs';
import { verifySync } from 'otplib';

export const NAME_MIN = 1;
export const NAME_MAX = 80;

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

/** The failure arm of {@link ActionResult}, for guards that only fail. */
export type ActionFailure = { ok: false; error: string };

export type SaveKeysResult =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { ok: true; data: { savedCount: number; clearedCount: number; at: number } }
  | { ok: false; error: string };

/**
 * Verify the user's account password against their bcrypt hash.
 * Returns true if the password is correct, false if the user has no
 * password set (OAuth-only) or the password doesn't match.
 */
export async function verifyAccountPassword(userId: string, password: string): Promise<boolean> {
  const hashedPassword = await getUserPasswordHash(userId);
  if (!hashedPassword) return false;
  return bcrypt.compare(password, hashedPassword);
}

/**
 * Enforce the account's TOTP gate when 2FA is enabled.
 *
 * Returns `null` when the action may proceed (2FA disabled, or a valid code
 * was supplied) and a failed `ActionResult` otherwise. Every sensitive
 * settings action (data export, key transfer, password change, account
 * deletion) uses this one check so the messages and validity window cannot
 * drift between them.
 */
export function verifyUserTwoFactorIfEnabled(
  user: { twoFactorEnabled?: boolean | null; twoFactorSecret?: string | null },
  code: string | undefined,
  missingMessage = '2FA code is required',
): ActionFailure | null {
  if (!user.twoFactorEnabled) return null;
  if (!code || code.length !== 6) return { ok: false, error: missingMessage };
  if (!user.twoFactorSecret) return { ok: false, error: 'Invalid 2FA code' };

  const secret = decryptSecret(user.twoFactorSecret);
  if (!secret || !verifySync({ secret, token: code }).valid) {
    return { ok: false, error: 'Invalid 2FA code' };
  }
  return null;
}
