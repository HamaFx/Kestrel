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

// Password-reset server actions: reset-link issuance and token-based
// password rotation.
import { getDb } from '@kestrel/ai';
import { createAuditLog, schema, withRateLimit } from '@kestrel/db';
import bcrypt from 'bcryptjs';
import { and, eq, gt, sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { z } from 'zod';

import { generateToken, hashToken } from '@/lib/auth/auth-tokens';
import { withServerActionLogging } from '@/lib/http/action-errors';
import { passwordSchema } from '@/lib/http/validation';
import { createScopedLoggerWithContext } from '@/lib/logger';

import {
  BCRYPT_COST,
  getAuthEmailBaseUrl,
  sendPasswordResetEmail,
  SYSTEM_USER_ID,
  unauthenticatedRateLimitKey,
} from './_actions-shared';

export async function forgotPasswordAction(prevState: unknown, formData: FormData) {
  return withServerActionLogging('forgotPasswordAction', async () => {
    const raw = formData instanceof FormData ? Object.fromEntries(formData) : (formData ?? {});
    const email = typeof raw.email === 'string' ? raw.email.trim().toLowerCase() : '';
    if (!email) return { error: 'Email is required' };

    const rl = await withRateLimit(
      SYSTEM_USER_ID,
      unauthenticatedRateLimitKey('forgot-email', email),
      3,
    );
    if (!rl.allowed) return { error: 'Too many requests. Try again later.' };

    const db = getDb();
    const [user] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);

    // Don't reveal whether the email exists
    if (user) {
      try {
        const { raw, hashed } = generateToken();
        // P0-6: store SHA-256 hash with purpose discriminator
        await db.insert(schema.verificationTokens).values({
          identifier: email,
          token: hashed,
          purpose: 'password_reset',
          expires: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
        });
        const baseUrl = getAuthEmailBaseUrl();
        const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(raw)}`;
        await sendPasswordResetEmail(email, resetUrl);
      } catch (err) {
        createScopedLoggerWithContext({
          component: 'auth-actions',
          action: 'forgot-password',
        }).error('Failed to create reset token: ' + String(err));
      }
    }

    return { success: true, message: 'If an account exists, a reset link has been sent.' };
  });
}

export async function resetPasswordAction(prevState: unknown, formData: FormData) {
  return withServerActionLogging('resetPasswordAction', async () => {
    const raw = formData instanceof FormData ? Object.fromEntries(formData) : (formData ?? {});
    const token = typeof raw.token === 'string' ? raw.token : '';
    const password = typeof raw.password === 'string' ? raw.password : '';

    if (!token) return { error: 'Missing reset token' };

    // BUG-4: Rate limit reset attempts per client IP to prevent token enumeration / brute force.
    const headersList = await headers();
    const clientIp =
      headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      headersList.get('x-real-ip') ||
      'unknown';
    const rl = await withRateLimit(
      SYSTEM_USER_ID,
      unauthenticatedRateLimitKey('reset-ip', clientIp),
      5,
    );
    if (!rl.allowed) {
      return { error: 'Too many reset attempts. Please try again later.' };
    }

    const parsed = z.object({ password: passwordSchema }).safeParse({ password });

    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Invalid password' };
    }

    const db = getDb();
    // P0-6: Hash the incoming raw token and filter by purpose
    const hashedToken = hashToken(token);
    const [vt] = await db
      .select()
      .from(schema.verificationTokens)
      .where(
        and(
          eq(schema.verificationTokens.token, hashedToken),
          eq(schema.verificationTokens.purpose, 'password_reset'),
          gt(schema.verificationTokens.expires, new Date()),
        ),
      )
      .limit(1);

    if (!vt) {
      // M-6: Run a dummy bcrypt compare to normalize response timing.
      // Using a pre-computed hash (same pattern as auth.ts) is much
      // faster than a full bcrypt.hash() while providing the same
      // constant-time guarantee against token enumeration.
      await bcrypt.compare(
        'dummy-timing-defense',
        '$2b$12$LyYuAYJhLrPU7mAIQPzVNu5HBJ/neEmE2uZZDD5ayPPROn5ruSaJ2',
      );
      return { error: 'Invalid or expired reset link' };
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_COST);

    let userId: string | null = null;
    await db.transaction(async (tx) => {
      const [u] = await tx
        .update(schema.users)
        .set({ hashedPassword, tokenVersion: sql`${schema.users.tokenVersion} + 1` })
        .where(eq(schema.users.email, vt.identifier))
        .returning({ id: schema.users.id });
      if (u) userId = u.id;
      await tx
        .delete(schema.verificationTokens)
        .where(
          and(
            eq(schema.verificationTokens.token, hashedToken),
            eq(schema.verificationTokens.purpose, 'password_reset'),
          ),
        );
    });

    // FEAT-03: Audit log for password reset
    if (userId) {
      try {
        await createAuditLog(userId, 'password_reset');
      } catch {
        /* fail open */
      }
    }

    return { success: true, message: 'Password has been reset. You can now sign in.' };
  });
}
