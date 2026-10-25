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

// Shared helpers for the auth server actions: rate-limit subjects, action
// state types, and transactional email delivery. This module exports no
// server actions, so it must not carry a "use server" directive.

import { createHmac } from 'node:crypto';

import { createScopedLoggerWithContext } from '@/lib/logger';

export const BCRYPT_COST = 12;
export const SYSTEM_USER_ID = '__system__';

/** Keep unauthenticated rate-limit subjects out of the user_id FK and avoid
 * storing raw IP addresses or email addresses in the rate_limits table. */
export function unauthenticatedRateLimitKey(kind: string, value: string): string {
  const secret = process.env.AUTH_SECRET ?? 'dev-only-rate-limit-key';
  const digest = createHmac('sha256', secret).update(value).digest('hex');
  return `${kind}:${digest}`;
}

export interface AuthActionState {
  error?: string;
  success?: boolean;
  requires2FA?: boolean;
  email?: string;
}

export function getAuthEmailBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const candidate =
    configured || (process.env.NODE_ENV !== 'production' ? 'http://localhost:3000' : '');
  if (!candidate) throw new Error('NEXT_PUBLIC_APP_URL must be configured in production');

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error('NEXT_PUBLIC_APP_URL must be a valid HTTP(S) URL');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hash ||
    url.search
  ) {
    throw new Error(
      'NEXT_PUBLIC_APP_URL must be a public HTTP(S) URL without credentials, queries, or fragments',
    );
  }
  return candidate.replace(/\/+$/, '');
}

function logEmailLinkForDevelopment(action: string, url: string): void {
  if (process.env.NODE_ENV === 'production' || process.env.AUTH_DEBUG_EMAIL_LINKS !== 'true')
    return;
  createScopedLoggerWithContext({ component: 'auth-actions', action }).info(
    `development email link: ${url}`,
  );
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.ALERT_FROM_EMAIL;
  if (!apiKey || !fromEmail) {
    if (process.env.NODE_ENV !== 'production') {
      logEmailLinkForDevelopment('send-reset-email', resetUrl);
    } else {
      const error = new Error('Password reset email is not configured');
      createScopedLoggerWithContext({
        component: 'auth-actions',
        action: 'send-reset-email',
      }).errorContext(
        error,
        'Password reset email is not configured; refusing to log the reset token.',
      );
    }
    return;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject: '[Kestrel] Reset your password',
        html: `<p>Click the link below to reset your password. This link expires in 1 hour.</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      createScopedLoggerWithContext({
        component: 'auth-actions',
        action: 'send-reset-email',
      }).error(`Failed to send reset email: HTTP ${res.status} ${text.slice(0, 200)}`);
    }
  } catch (err) {
    createScopedLoggerWithContext({ component: 'auth-actions', action: 'send-reset-email' }).error(
      'Failed to send reset email: ' + String(err),
    );
  }
}

/** P0-5: Send email verification link via Resend. */
export async function sendVerificationEmail(to: string, verifyUrl: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.ALERT_FROM_EMAIL;
  if (!apiKey || !fromEmail) {
    if (process.env.NODE_ENV !== 'production') {
      logEmailLinkForDevelopment('send-verify-email', verifyUrl);
    } else {
      const error = new Error('Verification email is not configured');
      createScopedLoggerWithContext({
        component: 'auth-actions',
        action: 'send-verify-email',
      }).errorContext(
        error,
        'Verification email is not configured; refusing to log the verification token.',
      );
    }
    return;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject: '[Kestrel] Verify your email address',
        html: `<p>Welcome to Kestrel! Click the link below to verify your email address. This link expires in 24 hours.</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      createScopedLoggerWithContext({
        component: 'auth-actions',
        action: 'send-verify-email',
      }).error(`Failed to send verify email: HTTP ${res.status} ${text.slice(0, 200)}`);
    }
  } catch (err) {
    createScopedLoggerWithContext({ component: 'auth-actions', action: 'send-verify-email' }).error(
      'Failed to send verify email: ' + String(err),
    );
  }
}
