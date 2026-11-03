// SPDX-License-Identifier: Apache-2.0

// Phase 1 (Task 1.2) — public registration policy.
//
// A freshly deployed instance must not accept arbitrary sign-ups before its
// owner has claimed it. `REGISTRATION_MODE=first_user` (the default) keeps
// registration open only while the `user` table is empty; the account that
// claims the instance becomes its administrator. Once that account exists,
// public registration is closed until the operator explicitly sets
// `REGISTRATION_MODE=open` or invites users.
//
// `countUsers` includes soft-deleted rows on purpose: deleting the only admin
// must not reopen public registration.

import 'server-only';

import { countUsers } from '@kestrel/db';

import { getServerEnv } from '@/lib/env';

export type RegistrationDecision =
  | { allowed: true; role: 'admin' | 'user'; firstUser: boolean }
  | { allowed: false; reason: string };

export const REGISTRATION_CLOSED_REASON =
  'Registration is closed. Ask the instance administrator for an invite.';
const REGISTRATION_DISABLED_REASON = 'Registration is disabled by the instance owner.';

/**
 * Resolve whether this instance accepts a new public account right now, and
 * which role that account receives.
 *
 * This is the pre-flight check used for a friendly error message. The
 * first-admin promotion is re-checked atomically inside
 * `createUserWithSettings({ requireFirstUser: true })`, so two concurrent
 * first registrations cannot both become administrator.
 */
export async function resolveRegistrationPolicy(): Promise<RegistrationDecision> {
  const mode = getServerEnv().REGISTRATION_MODE;
  if (mode === 'disabled') return { allowed: false, reason: REGISTRATION_DISABLED_REASON };

  // `countUsers` is the admin listing helper; normalize in case the driver
  // returns count(*) as a bigint string.
  const users = Number(await countUsers());
  if (users === 0) return { allowed: true, role: 'admin', firstUser: true };
  if (mode === 'first_user') return { allowed: false, reason: REGISTRATION_CLOSED_REASON };
  return { allowed: true, role: 'user', firstUser: false };
}
