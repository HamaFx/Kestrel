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

// Registration server action: account creation, email-verification token
// issuance, and automatic sign-in.
import {
  createUserWithSettings,
  createVerificationToken,
  userExistsByEmail,
  withRateLimit,
} from '@kestrel/db';
import bcrypt from 'bcryptjs';
import { AuthError } from 'next-auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { signIn } from '@/auth';
import { generateToken } from '@/lib/auth/auth-tokens';
import { isFailedSignIn } from '@/lib/auth/sign-in-result';
import { getServerEnv } from '@/lib/env';
import { logActionError, withServerActionLogging } from '@/lib/http/action-errors';
import { passwordSchema } from '@/lib/http/validation';
import { createScopedLoggerWithContext } from '@/lib/logger';

import {
  BCRYPT_COST,
  getAuthEmailBaseUrl,
  sendVerificationEmail,
  SYSTEM_USER_ID,
  unauthenticatedRateLimitKey,
  type AuthActionState,
} from './_actions-shared';

function registrationSignInFailureState(): AuthActionState {
  return { error: 'Account created, but failed to automatically sign in' };
}

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.email('Invalid email address'),
  password: passwordSchema,
});

export async function registerAction(
  prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  return withServerActionLogging('registerAction', async () => {
    const raw = formData instanceof FormData ? Object.fromEntries(formData) : (formData ?? {});
    const parsed = registerSchema.safeParse(raw);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Validation failed' };
    }

    const { name, email, password } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();
    const registrationMode = getServerEnv().REGISTRATION_MODE;
    if (registrationMode === 'disabled') {
      return { error: 'Registration is disabled by the instance owner.' };
    }

    // INFRA-08: Rate limit registrations per IP — 5 per minute per IP.
    // This prevents automated account-creation spam.
    const headersList = await headers();
    const clientIp =
      headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      headersList.get('x-real-ip') ||
      'unknown';
    const rl = await withRateLimit(
      SYSTEM_USER_ID,
      unauthenticatedRateLimitKey('register-ip', clientIp),
      5,
    );
    if (!rl.allowed) {
      return { error: 'Too many registration attempts. Please try again later.' };
    }

    const existingUser = await userExistsByEmail(normalizedEmail);
    if (existingUser) {
      return { error: 'An account with this email already exists' };
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_COST);
    const newUserId = crypto.randomUUID();

    // STAB-10: Wrap the users + userSettings insert in a single transaction
    // so a partial failure (e.g. userSettings FK violation) rolls back the user row.
    // Open registration means every account is created the same way —
    // standard user creation with tenant settings.
    await createUserWithSettings({
      id: newUserId,
      email: normalizedEmail,
      name,
      hashedPassword,
    });

    // HIGH-04: Generate email verification token
    try {
      const baseUrl = getAuthEmailBaseUrl();
      const { raw, hashed } = generateToken();
      const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      await createVerificationToken(normalizedEmail, hashed, 'email_verify', verifyExpires);
      const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${encodeURIComponent(raw)}`;
      // P0-5: Actually send the verification email
      await sendVerificationEmail(normalizedEmail, verifyUrl);
    } catch (err) {
      createScopedLoggerWithContext({
        component: 'auth-actions',
        action: 'register-verification-token',
      }).errorContext(err, 'createVerificationToken', { email: normalizedEmail });
    }

    try {
      const result = await signIn('credentials', {
        email: normalizedEmail,
        password,
        rememberMe: 'true', // new registrations get remembered by default
        redirectTo: '/onboarding',
        redirect: false,
      });
      if (isFailedSignIn(result)) {
        return registrationSignInFailureState();
      }
    } catch (error) {
      const errStr = String(error);
      if (errStr.includes('NEXT_REDIRECT')) throw error;
      if (error instanceof AuthError) {
        return registrationSignInFailureState();
      }
      logActionError(error, 'registerAction');
      return { error: 'Unable to finish registration right now. Please try again.' };
    }

    // Redirect only after the authentication call has completed successfully.
    redirect('/onboarding');
  });
}
