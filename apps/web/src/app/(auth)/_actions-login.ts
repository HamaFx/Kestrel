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

// Login server action: credential sign-in with IP/email rate limiting,
// 2FA challenge handling, and open-redirect sanitization.
import { withRateLimit } from '@kestrel/db';
import { AuthError } from 'next-auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { signIn } from '@/auth';
import { recordAuthEvent } from '@/lib/auth/auth-anomaly';
import { isFailedSignIn } from '@/lib/auth/sign-in-result';
import { logActionError, withServerActionLogging } from '@/lib/http/action-errors';

import {
  SYSTEM_USER_ID,
  unauthenticatedRateLimitKey,
  type AuthActionState,
} from './_actions-shared';

function invalidCredentialsState(): AuthActionState {
  recordAuthEvent('login_failure');
  return { error: 'Invalid email or password' };
}

/**
 * P2-7: Centralized redirect sanitizer. Blocks open redirects via
 * protocol-relative URLs, backslashes, and encoded // sequences.
 */
export async function sanitizeNext(next: string | undefined | null): Promise<string> {
  if (typeof next !== 'string' || next.length === 0) return '/dashboard';
  if (next.length > 500) return '/dashboard';
  if (!next.startsWith('/')) return '/dashboard';
  if (next.startsWith('//')) return '/dashboard';
  if (next.includes('\\')) return '/dashboard';
  if (/%2f/i.test(next) && /%2f.*%2f/i.test(next)) return '/dashboard';
  return next;
}

const loginSchema = z.object({
  email: z.email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  next: z.string().optional(),
});

export async function loginAction(
  prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  return withServerActionLogging('loginAction', async () => {
    const raw = formData instanceof FormData ? Object.fromEntries(formData) : (formData ?? {});
    const parsed = loginSchema.safeParse(raw);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Validation failed' };
    }

    const { email, password, next } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();

    // HIGH-02: Rate limit login attempts
    const headersList = await headers();
    const clientIp =
      headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      headersList.get('x-real-ip') ||
      'unknown';
    const rl = await withRateLimit(
      SYSTEM_USER_ID,
      unauthenticatedRateLimitKey('login-ip', clientIp),
      10,
    );
    if (!rl.allowed) {
      return { error: 'Too many login attempts. Please try again later.' };
    }

    const rlEmail = await withRateLimit(
      SYSTEM_USER_ID,
      unauthenticatedRateLimitKey('login-email', normalizedEmail),
      5,
    );
    if (!rlEmail.allowed) {
      return { error: 'Too many login attempts for this email. Please try again later.' };
    }

    // P2-7: Centralized redirect sanitizer
    const safeNext = await sanitizeNext(next);

    // P0-4: Capture device info for session management.
    // L-7: User-Agent is truncated to 255 chars and only stored in the
    // session DB row. It is NOT rendered unsanitized in any UI — admin
    // dashboards use React's built-in escaping. If a raw-html rendering
    // path is added, it must encode this value first.
    const ua = headersList.get('user-agent')?.slice(0, 255) || undefined;

    try {
      const result = await signIn('credentials', {
        email: normalizedEmail,
        password,
        totpCode: (formData.get('totpCode') as string) || undefined,
        rememberMe: (formData.get('rememberMe') as string) || undefined,
        deviceName: ua,
        ip: clientIp !== 'unknown' ? clientIp : undefined,
        redirectTo: safeNext,
        redirect: false,
      });
      if (isFailedSignIn(result)) {
        return invalidCredentialsState();
      }
    } catch (error) {
      const errStr = String(error);
      // P3-2: isRedirectError from next/navigation unavailable in this
      // Next.js version — fall back to string check for NEXT_REDIRECT.
      if (errStr.includes('NEXT_REDIRECT')) {
        recordAuthEvent('login_success');
        throw error;
      }
      if (error instanceof AuthError) {
        const message = error.message;
        if (message === 'ACCOUNT_LOCKED') {
          // recorded in authorize() — no duplicate
          return {
            error: 'Account temporarily locked due to too many failed attempts. Try again later.',
          };
        }
        if (message === '2FA_REQUIRED') {
          return { requires2FA: true, email: normalizedEmail };
        }
        if (message === 'INVALID_2FA_CODE') {
          // recorded in authorize() — no duplicate
          return { error: 'Invalid 2FA code', requires2FA: true };
        }
        if (message === '2FA_LOCKED') {
          return {
            error: 'Too many failed 2FA attempts. Try again in 15 minutes.',
            requires2FA: true,
          };
        }
        if (message === '2FA_RATE_LIMITED') {
          return { error: 'Too many 2FA attempts. Please try again shortly.', requires2FA: true };
        }
        if (message === '2FA_SYSTEM_ERROR') {
          return { error: 'Unable to verify 2FA right now. Please try again.', requires2FA: true };
        }
        if (message === 'AUTH_SYSTEM_ERROR' || message === 'SESSION_SYSTEM_ERROR') {
          logActionError(error, 'loginAction');
          return { error: 'Unable to sign in right now. Please try again.' };
        }
        return invalidCredentialsState();
      }
      logActionError(error, 'loginAction');
      return { error: 'Unable to sign in right now. Please try again.' };
    }

    // P1-1: Record login success only after signIn resolves without throwing.
    recordAuthEvent('login_success');
    // Keep the Next.js redirect outside the catch block so its control-flow
    // exception is never mistaken for an authentication failure.
    redirect(safeNext);
  });
}
