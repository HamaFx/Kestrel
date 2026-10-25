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

// Email-verification server action: resends verification links without
// revealing whether an account exists or is already verified.
import { getDb } from '@kestrel/ai';
import { schema, withRateLimit } from '@kestrel/db';
import { eq } from 'drizzle-orm';

import { generateToken } from '@/lib/auth/auth-tokens';
import { createScopedLoggerWithContext } from '@/lib/logger';

import {
  getAuthEmailBaseUrl,
  sendVerificationEmail,
  SYSTEM_USER_ID,
  unauthenticatedRateLimitKey,
} from './_actions-shared';

/**
 * P0-5: Resend email verification link.
 * Rate-limited: 3 requests per email per 5 minutes.
 */
export async function resendVerificationAction(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    return { error: 'Invalid email address' };
  }

  const rl = await withRateLimit(
    SYSTEM_USER_ID,
    unauthenticatedRateLimitKey('resend-verify-email', normalizedEmail),
    3,
  );
  if (!rl.allowed) {
    return { error: 'Too many requests. Please try again later.' };
  }

  const db = getDb();
  const [user] = await db
    .select({ id: schema.users.id, emailVerified: schema.users.emailVerified })
    .from(schema.users)
    .where(eq(schema.users.email, normalizedEmail))
    .limit(1);

  // Don't reveal whether the email exists or is already verified
  if (!user || user.emailVerified) {
    return {
      success: true,
      message: 'If the email is unverified, a new verification link has been sent.',
    };
  }

  try {
    const baseUrl = getAuthEmailBaseUrl();
    const { raw, hashed } = generateToken();
    const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.insert(schema.verificationTokens).values({
      identifier: normalizedEmail,
      token: hashed,
      purpose: 'email_verify',
      expires: verifyExpires,
    });
    const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${encodeURIComponent(raw)}`;
    await sendVerificationEmail(normalizedEmail, verifyUrl);
  } catch (err) {
    createScopedLoggerWithContext({ component: 'auth-actions', action: 'resend-verify' }).error(
      'Failed to resend verification: ' + String(err),
    );
  }

  return {
    success: true,
    message: 'If the email is unverified, a new verification link has been sent.',
  };
}
