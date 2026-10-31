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

// Auth query helpers — atomic account anonymisation and data purge.

import { eq, or, sql } from 'drizzle-orm';

import { getDb, schema } from '../../client';

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
    await tx.delete(schema.aiRegressionCases).where(eq(schema.aiRegressionCases.userId, userId));
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
    await tx.delete(schema.fullAnalysisQueue).where(eq(schema.fullAnalysisQueue.userId, userId));
    await tx.delete(schema.persistenceOutbox).where(eq(schema.persistenceOutbox.userId, userId));
    await tx.delete(schema.mutationExecutions).where(eq(schema.mutationExecutions.userId, userId));
    await tx
      .delete(schema.aiBudgetReservations)
      .where(eq(schema.aiBudgetReservations.userId, userId));
    await tx.delete(schema.dailyAiSpend).where(eq(schema.dailyAiSpend.userId, userId));
    await tx.delete(schema.chatToolTelemetry).where(eq(schema.chatToolTelemetry.userId, userId));
    await tx.delete(schema.chatTelemetry).where(eq(schema.chatTelemetry.userId, userId));
    await tx.delete(schema.diagnosticTraces).where(eq(schema.diagnosticTraces.userId, userId));

    // Purge user-owned product data. Deleting threads cascades their messages
    // and any legacy child rows not covered by the explicit deletes above.
    await tx.delete(schema.chatThreads).where(eq(schema.chatThreads.userId, userId));
    await tx.delete(schema.alerts).where(eq(schema.alerts.userId, userId));
    await tx.delete(schema.journalEntries).where(eq(schema.journalEntries.userId, userId));
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
    // audit rows still reference it, so this does not destroy tenant history.
    await tx.delete(schema.organizationMember).where(eq(schema.organizationMember.userId, userId));

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
