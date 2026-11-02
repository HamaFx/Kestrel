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

// Account verification and token-maintenance service.
//
// The route handlers stay controllers: they validate transport-level input and
// map the service result to HTTP. Token hashing, purpose filtering, single-use
// consumption, and retention pruning live here.

import 'server-only';

import {
  deleteVerificationToken,
  findVerificationToken,
  lazyPurgeExpiredTokens,
  verifyUserEmail,
} from '@kestrel/db';

import { hashToken } from '@/lib/auth/auth-tokens';

const EMAIL_VERIFY_PURPOSE = 'email_verify';

export type VerifyEmailTokenResult = { ok: true } | { ok: false; reason: 'missing' | 'invalid' };

/**
 * Consume an email-verification token.
 *
 * P0-6: the token is hashed and filtered by `purpose=email_verify`, so a
 * password-reset token can never verify an email. Consumption is single-use:
 * the row is deleted after the user is marked verified.
 */
export async function verifyEmailTokenService(rawToken: string): Promise<VerifyEmailTokenResult> {
  if (!rawToken) return { ok: false, reason: 'missing' };

  const hashedToken = hashToken(rawToken);
  const token = await findVerificationToken(hashedToken, EMAIL_VERIFY_PURPOSE);
  if (!token) return { ok: false, reason: 'invalid' };

  await verifyUserEmail(token.identifier);
  await deleteVerificationToken(hashedToken, EMAIL_VERIFY_PURPOSE);
  return { ok: true };
}

/** Delete every expired verification token and return the removed count. */
export async function purgeExpiredVerificationTokensService(): Promise<number> {
  return lazyPurgeExpiredTokens();
}
