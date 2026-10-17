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

// Behavioral coverage for the auth flow's pure helpers: the sign-in result
// contract, open-redirect sanitization, and server-action redirect logging.
// End-to-end coverage lives in the Playwright auth spec and the manual
// smoke test where `docker compose up` provides a real Postgres.

import { describe, expect, it, vi } from 'vitest';

import { sanitizeNext } from '../src/app/(auth)/actions';
import * as actionErrors from '../src/lib/action-errors';
import { isFailedSignIn } from '../src/lib/auth/sign-in-result';

describe('isFailedSignIn (next-auth beta.32 contract)', () => {
  it('treats a string result (redirect URL) as success', () => {
    // next-auth >= beta.32 with { redirect: false } returns the redirect
    // URL string on success — never { ok: true }. See actions.ts for details.
    expect(isFailedSignIn('/chat')).toBe(false);
    expect(isFailedSignIn('http://localhost:3000/onboarding')).toBe(false);
  });

  it('treats an explicit { ok: false } result as failure', () => {
    expect(isFailedSignIn({ ok: false, error: 'CredentialsSignin' })).toBe(true);
  });

  it('treats { ok: true } as success', () => {
    expect(isFailedSignIn({ ok: true })).toBe(false);
  });
});

describe('sanitizeNext (P2-7)', () => {
  it.each([
    ['preserves a safe settings path', '/settings', '/settings'],
    ['preserves a safe chat path', '/chat', '/chat'],
    ['blocks protocol-relative URLs', '//evil.com', '/dashboard'],
    ['blocks absolute URLs', 'https://evil.com', '/dashboard'],
    ['blocks backslash injection (prefix)', '\\evil.com', '/dashboard'],
    ['blocks backslash injection (infix)', '/path\\evil', '/dashboard'],
    ['blocks encoded double-slash', '/%2f%2fevil', '/dashboard'],
    ['caps at 500 chars', `/${'a'.repeat(600)}`, '/dashboard'],
    ['falls back for null', null, '/dashboard'],
    ['falls back for undefined', undefined, '/dashboard'],
    ['falls back for empty string', '', '/dashboard'],
  ])('%s', async (_label, input, expected) => {
    expect(await sanitizeNext(input)).toBe(expected);
  });
});

describe('withServerActionLogging redirect handling', () => {
  it('does not log NEXT_REDIRECT errors', async () => {
    const loggerModule = await import('../src/lib/logger');
    const spy = vi.spyOn(loggerModule, 'createScopedLoggerWithContext');
    spy.mockClear();

    const redirectErr = new Error('NEXT_REDIRECT');
    await expect(
      actionErrors.withServerActionLogging('loginAction', async () => {
        throw redirectErr;
      }),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
