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

// Phase 1 (Task 1.2) — public registration is closed after the first account
// unless the operator explicitly opts into open registration.

import { beforeEach, describe, expect, it, vi } from 'vitest';

type RegistrationMode = 'first_user' | 'open' | 'disabled';

const state = vi.hoisted(() => ({
  mode: 'first_user' as RegistrationMode,
  userCount: 0,
}));

vi.mock('@/lib/env', () => ({
  getServerEnv: () => ({ REGISTRATION_MODE: state.mode }),
}));

vi.mock('@kestrel/db', () => ({
  countUsers: async () => state.userCount,
}));

vi.mock('server-only', () => ({}));

import { resolveRegistrationPolicy } from '../src/lib/auth/registration-policy';

beforeEach(() => {
  state.mode = 'first_user';
  state.userCount = 0;
});

describe('resolveRegistrationPolicy', () => {
  it('promotes the first account to admin in first_user mode', async () => {
    const decision = await resolveRegistrationPolicy();

    expect(decision).toEqual({ allowed: true, role: 'admin', firstUser: true });
  });

  it('closes first_user registration once an account exists', async () => {
    state.userCount = 1;

    const decision = await resolveRegistrationPolicy();

    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toMatch(/registration is closed/i);
  });

  it('counts soft-deleted accounts (countUsers contract) by never reopening', async () => {
    // countUsers includes deleted rows; a non-zero count is enough to close.
    state.userCount = 2;

    expect((await resolveRegistrationPolicy()).allowed).toBe(false);
  });

  it('allows regular accounts in explicit open mode', async () => {
    state.mode = 'open';
    state.userCount = 4;

    expect(await resolveRegistrationPolicy()).toEqual({
      allowed: true,
      role: 'user',
      firstUser: false,
    });
  });

  it('still promotes the first account in open mode', async () => {
    state.mode = 'open';
    state.userCount = 0;

    expect(await resolveRegistrationPolicy()).toEqual({
      allowed: true,
      role: 'admin',
      firstUser: true,
    });
  });

  it('refuses new accounts in disabled mode even on an empty instance', async () => {
    state.mode = 'disabled';

    const decision = await resolveRegistrationPolicy();

    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toMatch(/registration is disabled/i);
  });
});
