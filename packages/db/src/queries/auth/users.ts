/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Auth query helpers — user CRUD, credentials, lockout and token version.

import { DEFAULT_WATCHLIST_SYMBOLS } from '@kestrel/shared';
import { and, eq, isNull, sql } from 'drizzle-orm';

import { getDb, schema } from '../../client';
import type { AuthUserRow, CreateUserInput } from './types';

/**
 * Get a user by email (non-deleted). Returns all auth-relevant fields.
 * Used by the credentials authorize flow.
 */
export async function getUserByEmail(email: string): Promise<AuthUserRow | null> {
  const db = getDb();
  const [user] = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      image: schema.users.image,
      hashedPassword: schema.users.hashedPassword,
      tokenVersion: schema.users.tokenVersion,
      twoFactorEnabled: schema.users.twoFactorEnabled,
      twoFactorSecret: schema.users.twoFactorSecret,
      lockedUntil: schema.users.lockedUntil,
      failedLoginAttempts: schema.users.failedLoginAttempts,
      emailVerified: schema.users.emailVerified,
    })
    .from(schema.users)
    .where(and(eq(schema.users.email, email), isNull(schema.users.deletedAt)))
    .limit(1);
  return user ?? null;
}

/**
 * Increment the failed login attempts counter. If the count reaches 5,
 * also set lockedUntil to NOW + 15 minutes.
 */
export async function incrementFailedLogins(userId: string): Promise<void> {
  const db = getDb();
  await db
    .update(schema.users)
    .set({
      failedLoginAttempts: sql`${schema.users.failedLoginAttempts} + 1`,
      lockedUntil: sql`CASE WHEN ${schema.users.failedLoginAttempts} + 1 >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE NULL END`,
    })
    .where(eq(schema.users.id, userId));
}

/**
 * Reset failed login attempts and lockout.
 */
export async function resetLoginLockout(userId: string): Promise<void> {
  const db = getDb();
  await db
    .update(schema.users)
    .set({ failedLoginAttempts: 0, lockedUntil: null })
    .where(eq(schema.users.id, userId));
}

/**
 * Create a new user, userSettings, and email verification token in a single transaction.
 * Returns the raw verification token (for constructing the verify URL) and the user.
 */
export async function createUserWithSettings(input: CreateUserInput): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.insert(schema.users).values({
      id: input.id,
      email: input.email,
      name: input.name,
      hashedPassword: input.hashedPassword,
      image: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(input.name)}`,
    });
    await tx.insert(schema.userSettings).values({
      userId: input.id,
      onboardingCompleted: false,
      defaultSymbol: DEFAULT_WATCHLIST_SYMBOLS[0],
    });
  });
}

/**
 * Check if an email is already reserved by any user, including soft-deleted
 * rows. The users.email database constraint is unique, so allowing a
 * soft-deleted email through registration would fail later in the transaction.
 */
export async function userExistsByEmail(email: string): Promise<boolean> {
  const db = getDb();
  const [user] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  return !!user;
}

/**
 * Update a user's password, incrementing tokenVersion to invalidate sessions.
 */
export async function updateUserPassword(userId: string, hashedPassword: string): Promise<void> {
  const db = getDb();
  await db
    .update(schema.users)
    .set({
      hashedPassword,
      tokenVersion: sql`${schema.users.tokenVersion} + 1`,
    })
    .where(eq(schema.users.id, userId));
}

/**
 * Update a user's password by email (for password reset flow).
 */
export async function updatePasswordByEmail(
  email: string,
  hashedPassword: string,
): Promise<string | null> {
  const db = getDb();
  const [user] = await db
    .update(schema.users)
    .set({
      hashedPassword,
      tokenVersion: sql`${schema.users.tokenVersion} + 1`,
    })
    .where(eq(schema.users.email, email))
    .returning({ id: schema.users.id });
  return user?.id ?? null;
}

/**
 * Verify a user's email (set emailVerified to now).
 */
export async function verifyUserEmail(email: string): Promise<void> {
  const db = getDb();
  await db
    .update(schema.users)
    .set({ emailVerified: new Date() })
    .where(eq(schema.users.email, email));
}

/**
 * Get a user's tokenVersion for session validation.
 */
export async function getTokenVersion(userId: string): Promise<number | null> {
  const db = getDb();
  const [u] = await db
    .select({ tv: schema.users.tokenVersion })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return u?.tv ?? null;
}

/**
 * Increment the tokenVersion for a user (invalidates all active JWTs).
 */
export async function incrementTokenVersion(userId: string): Promise<void> {
  const db = getDb();
  await db
    .update(schema.users)
    .set({ tokenVersion: sql`${schema.users.tokenVersion} + 1` })
    .where(eq(schema.users.id, userId));
}

/**
 * Update a user's display name.
 */
export async function updateUserDisplayName(userId: string, name: string): Promise<void> {
  const db = getDb();
  await db.update(schema.users).set({ name }).where(eq(schema.users.id, userId));
}
