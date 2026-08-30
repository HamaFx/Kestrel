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

// Auth query helpers — login, registration, password reset, verification tokens.

import { DEFAULT_WATCHLIST_SYMBOLS } from '@kestrel/shared';
import { and, eq, gt, isNull, ne, or, sql } from 'drizzle-orm';

import { getDb, schema } from '../client';
import { requireTenantIdForUser } from '../tenant';

const SYSTEM_USER_ID = '__system__';

export interface AuthUserRow {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  hashedPassword: string | null;
  tokenVersion: number;
  twoFactorEnabled: boolean;
  twoFactorSecret: string | null;
  lockedUntil: Date | null;
  failedLoginAttempts: number;
  emailVerified: Date | null;
}

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

/** Input for creating a new user + userSettings in a transaction. */
export interface CreateUserInput {
  id: string;
  email: string;
  name: string;
  hashedPassword: string;
  /** Serialize owner-first registration and reject a second initial account. */
  initialUserOnly?: boolean;
}

/**
 * Create a new user, userSettings, and email verification token in a single transaction.
 * Returns the raw verification token (for constructing the verify URL) and the user.
 */
export async function createUserWithSettings(input: CreateUserInput): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    if (input.initialUserOnly) {
      // Serialize the check and insert so two concurrent first-run requests
      // cannot both become the owner of a fresh deployment.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('kestrel:first-user-registration'))`,
      );
      const [existingUser] = await tx
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(and(isNull(schema.users.deletedAt), ne(schema.users.id, SYSTEM_USER_ID)))
        .limit(1);
      if (existingUser && existingUser.id !== SYSTEM_USER_ID) {
        throw new Error('INITIAL_USER_ALREADY_EXISTS');
      }
    }

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

/** Create a verification token (email_verify or password_reset). */
export async function createVerificationToken(
  identifier: string,
  hashedToken: string,
  purpose: string,
  expires: Date,
): Promise<void> {
  const db = getDb();
  await db.insert(schema.verificationTokens).values({
    identifier,
    token: hashedToken,
    purpose,
    expires,
  });
}

/** Find a non-expired verification token by hash + purpose. */
export async function findVerificationToken(hashedToken: string, purpose: string) {
  const db = getDb();
  const [vt] = await db
    .select()
    .from(schema.verificationTokens)
    .where(
      and(
        eq(schema.verificationTokens.token, hashedToken),
        eq(schema.verificationTokens.purpose, purpose),
        gt(schema.verificationTokens.expires, new Date()),
      ),
    )
    .limit(1);
  return vt ?? null;
}

/** Delete a verification token by hash + purpose (single-use). */
export async function deleteVerificationToken(hashedToken: string, purpose: string): Promise<void> {
  const db = getDb();
  await db
    .delete(schema.verificationTokens)
    .where(
      and(
        eq(schema.verificationTokens.token, hashedToken),
        eq(schema.verificationTokens.purpose, purpose),
      ),
    );
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
 * Check if a session still exists (not revoked).
 */
export async function findSession(sessionId: string): Promise<boolean> {
  const db = getDb();
  const [sess] = await db
    .select({ id: schema.userSessions.id })
    .from(schema.userSessions)
    .where(eq(schema.userSessions.id, sessionId))
    .limit(1);
  return !!sess;
}

/**
 * Update session last active time.
 */
export async function updateSessionLastActive(sessionId: string): Promise<void> {
  const db = getDb();
  await db
    .update(schema.userSessions)
    .set({ lastActiveAt: new Date() })
    .where(eq(schema.userSessions.id, sessionId));
}

/**
 * Create a user session row (JWT callback).
 */
export async function createUserSession(
  sessionId: string,
  userId: string,
  deviceName: string | null,
  ip: string | null,
): Promise<void> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  await db.execute(
    sql`INSERT INTO ${schema.userSessions} (id, user_id, tenant_id, device_name, ip)
        VALUES (${sessionId}, ${userId}, ${tenantId}, ${deviceName}, ${ip})`,
  );
}

/**
 * Update the two-factor secret for a user (stores encrypted secret).
 */
export async function updateTwoFactorSecret(
  userId: string,
  encryptedSecret: string | null,
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.users)
    .set({ twoFactorSecret: encryptedSecret })
    .where(eq(schema.users.id, userId));
}

/**
 * Get a user's two-factor secret.
 */
export async function getTwoFactorSecret(userId: string): Promise<string | null> {
  const db = getDb();
  const [user] = await db
    .select({ twoFactorSecret: schema.users.twoFactorSecret })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  return user?.twoFactorSecret ?? null;
}

/**
 * Enable or disable 2FA for a user.
 */
export async function setTwoFactorEnabled(userId: string, enabled: boolean): Promise<void> {
  const db = getDb();
  await db
    .update(schema.users)
    .set({ twoFactorEnabled: enabled })
    .where(eq(schema.users.id, userId));
}

/**
 * Update user's API keys (encrypted BYOK payload) and updatedAt map.
 */
export async function updateUserApiKeys(
  userId: string,
  encryptedKeys: string | null,
  keysUpdatedAt: Record<string, string> | null,
): Promise<void> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  await db
    .update(schema.userSettings)
    .set({
      aiApiKeys: encryptedKeys,
      ...(keysUpdatedAt !== null ? { aiApiKeysUpdatedAt: keysUpdatedAt } : {}),
    })
    .where(
      and(
        eq(schema.userSettings.userId, userId),
        eq(schema.userSettings.tenantId, tenantId),
      ),
    );
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
 * Atomically anonymize an account and purge user-owned application data.
 *
 * The user row remains as a tombstone so retained billing and audit records keep
 * their referential identity. Authentication material, user-owned application
 * data, derived AI data, operational queues, and diagnostics are removed in
 * this transaction. Billing projections, webhook history, tenant records,
 * general audit logs, and admin audit logs are deliberately retained.
 */
export async function deleteUserAccount(userId: string): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const [user] = await tx
      .select({ email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!user) return;

    // Remove rows that reference chat messages/feedback before deleting the
    // owning threads. Explicit deletes also cover legacy rows whose denormalized
    // parent IDs were inconsistent but whose user_id still identifies ownership.
    await tx
      .delete(schema.aiRegressionCases)
      .where(eq(schema.aiRegressionCases.userId, userId));
    await tx.delete(schema.aiMessageFeedback).where(eq(schema.aiMessageFeedback.userId, userId));
    await tx.delete(schema.agentOpinions).where(eq(schema.agentOpinions.userId, userId));
    await tx.delete(schema.briefingsEmitted).where(eq(schema.briefingsEmitted.userId, userId));

    // Purge user-owned AI state, queues, telemetry, and trace payloads.
    await tx.delete(schema.memoryEmbeddings).where(eq(schema.memoryEmbeddings.userId, userId));
    await tx
      .delete(schema.memoryBackfillState)
      .where(eq(schema.memoryBackfillState.userId, userId));
    await tx
      .delete(schema.memoryProjectionState)
      .where(eq(schema.memoryProjectionState.userId, userId));
    await tx.delete(schema.aiShadowComparisons).where(eq(schema.aiShadowComparisons.userId, userId));
    await tx.delete(schema.aiQualityResults).where(eq(schema.aiQualityResults.userId, userId));
    await tx.delete(schema.fullAnalysisQueue).where(eq(schema.fullAnalysisQueue.userId, userId));
    await tx.delete(schema.persistenceOutbox).where(eq(schema.persistenceOutbox.userId, userId));
    await tx.delete(schema.mutationExecutions).where(eq(schema.mutationExecutions.userId, userId));
    await tx.delete(schema.aiBudgetReservations).where(eq(schema.aiBudgetReservations.userId, userId));
    await tx.delete(schema.dailyAiSpend).where(eq(schema.dailyAiSpend.userId, userId));
    await tx.delete(schema.chatToolTelemetry).where(eq(schema.chatToolTelemetry.userId, userId));
    await tx.delete(schema.chatTelemetry).where(eq(schema.chatTelemetry.userId, userId));
    await tx.delete(schema.diagnosticTraces).where(eq(schema.diagnosticTraces.userId, userId));

    // Purge user-owned product data. Deleting threads cascades their messages
    // and any legacy child rows not covered by the explicit deletes above.
    await tx.delete(schema.chatThreads).where(eq(schema.chatThreads.userId, userId));
    await tx.delete(schema.alerts).where(eq(schema.alerts.userId, userId));
    await tx.delete(schema.journalEntries).where(eq(schema.journalEntries.userId, userId));
    await tx.delete(schema.portfolioPositions).where(eq(schema.portfolioPositions.userId, userId));
    await tx.delete(schema.portfolioSettings).where(eq(schema.portfolioSettings.userId, userId));
    await tx.delete(schema.sharedSnapshots).where(eq(schema.sharedSnapshots.userId, userId));
    await tx.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, userId));
    await tx.delete(schema.providerTests).where(eq(schema.providerTests.userId, userId));
    await tx
      .delete(schema.notificationNoiseState)
      .where(eq(schema.notificationNoiseState.userId, userId));
    await tx.delete(schema.botLinks).where(eq(schema.botLinks.userId, userId));
    await tx.delete(schema.userSymbols).where(eq(schema.userSymbols.userId, userId));
    await tx.delete(schema.rateLimits).where(eq(schema.rateLimits.userId, userId));

    // Membership is account-owned. The organization itself is retained when
    // billing/audit rows still reference it, so this does not destroy tenant
    // financial history.
    await tx
      .delete(schema.organizationMember)
      .where(eq(schema.organizationMember.userId, userId));

    const now = new Date();
    await tx
      .update(schema.users)
      .set({
        deletedAt: now,
        tokenVersion: sql`${schema.users.tokenVersion} + 1`,
        name: null,
        image: null,
        email: `deleted-${userId}@deleted.invalid`,
        hashedPassword: null,
        twoFactorSecret: null,
        twoFactorEnabled: false,
        twoFactorBackupCodes: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
        failed2faAttempts: 0,
        twoFactorLockedUntil: null,
      })
      .where(eq(schema.users.id, userId));

    await tx.delete(schema.userSettings).where(eq(schema.userSettings.userId, userId));
    await tx.delete(schema.accounts).where(eq(schema.accounts.userId, userId));
    await tx.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
    await tx
      .delete(schema.verificationTokens)
      .where(
        or(
          eq(schema.verificationTokens.identifier, user.email),
          eq(schema.verificationTokens.identifier, userId),
        ),
      );
    await tx.delete(schema.userSessions).where(eq(schema.userSessions.userId, userId));
  });
}

/**
 * Update a user's display name.
 */
export async function updateUserDisplayName(userId: string, name: string): Promise<void> {
  const db = getDb();
  await db.update(schema.users).set({ name }).where(eq(schema.users.id, userId));
}

/** Create an audit log entry (best-effort, fail open). */
export async function createAuditLog(
  userId: string,
  action: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    const db = getDb();
    const tenantId = await requireTenantIdForUser(userId, db);
    await db.insert(schema.auditLogs).values({ userId, tenantId, action, metadata });
  } catch {
    // fail open — audit logging is best-effort
  }
}
