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

// Data actions: clear chat history, data export.
import { deleteAllThreads, getDb } from '@kestrel/ai';
import { requireTenantIdForUser, schema, withRateLimit } from '@kestrel/db';
import { decryptSecret } from '@kestrel/shared/encryption';
import * as Sentry from '@sentry/nextjs';
import { and, eq, inArray } from 'drizzle-orm';
import { verifySync } from 'otplib';

import { auth } from '@/auth';

import { verifyAccountPassword, type ActionResult } from './_actions-shared';

/**
 * Server action to delete all chat history.
 */
export async function clearChatHistoryAction(): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false as const,
      error: 'Unauthorized',
    };
  }

  const rl = await withRateLimit(session.user.id, 'settings_clear_chat', 5);
  if (!rl.allowed) {
    return { ok: false as const, error: 'Too many requests. Try again later.' };
  }

  try {
    await deleteAllThreads(session.user.id);
    return { ok: true as const };
  } catch (err) {
    Sentry.captureException(err);
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

export async function exportDataAction(
  password?: string,
  totpCode?: string,
): Promise<ActionResult<string>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Unauthorized' };
  }

  // Require password verification for data export (3.6.1)
  if (!password || password.length < 8) {
    return { ok: false as const, error: 'Password is required to export your data' };
  }

  // Check 2FA if enabled
  const db = getDb();
  const [user] = await db
    .select({
      twoFactorEnabled: schema.users.twoFactorEnabled,
      twoFactorSecret: schema.users.twoFactorSecret,
    })
    .from(schema.users)
    .where(eq(schema.users.id, session.user.id));

  if (user?.twoFactorEnabled) {
    if (!totpCode) {
      return { ok: false as const, error: '2FA code is required to export your data' };
    }
    const decryptedSecret = user.twoFactorSecret ? decryptSecret(user.twoFactorSecret) : null;
    if (!decryptedSecret || !verifySync({ secret: decryptedSecret, token: totpCode }).valid) {
      return { ok: false as const, error: 'Invalid 2FA code' };
    }
  }

  const passwordValid = await verifyAccountPassword(session.user.id, password);
  if (!passwordValid) {
    return { ok: false as const, error: 'Incorrect account password' };
  }

  const rl = await withRateLimit(session.user.id, 'settings_export', 3);
  if (!rl.allowed) {
    return { ok: false as const, error: 'Too many requests. Try again later.' };
  }

  try {
    const db = getDb();
    const userId = session.user.id;
    const tenantId = await requireTenantIdForUser(userId, db);

    const [profile] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    const settings = await db
      .select()
      .from(schema.userSettings)
      .where(
        and(
          eq(schema.userSettings.userId, userId),
          eq(schema.userSettings.tenantId, tenantId),
        ),
      );
    const threads = await db
      .select()
      .from(schema.chatThreads)
      .where(and(eq(schema.chatThreads.userId, userId), eq(schema.chatThreads.tenantId, tenantId)));
    const threadIds = threads.map((t) => t.id);
    const messages = threadIds.length
      ? await db
          .select({ message: schema.chatMessages })
          .from(schema.chatMessages)
          .innerJoin(
            schema.chatThreads,
            and(
              eq(schema.chatMessages.threadId, schema.chatThreads.id),
              eq(schema.chatThreads.userId, userId),
              eq(schema.chatThreads.tenantId, tenantId),
              eq(schema.chatMessages.tenantId, tenantId),
            ),
          )
          .where(inArray(schema.chatMessages.threadId, threadIds))
      : [];

    const journalEntries = await db
      .select()
      .from(schema.journalEntries)
      .where(and(eq(schema.journalEntries.userId, userId), eq(schema.journalEntries.tenantId, tenantId)));
    const alerts = await db
      .select()
      .from(schema.alerts)
      .where(and(eq(schema.alerts.userId, userId), eq(schema.alerts.tenantId, tenantId)));
    const symbols = await db
      .select()
      .from(schema.userSymbols)
      .where(and(eq(schema.userSymbols.userId, userId), eq(schema.userSymbols.tenantId, tenantId)));
    const pushSubscriptions = await db
      .select()
      .from(schema.pushSubscriptions)
      .where(
        and(
          eq(schema.pushSubscriptions.userId, userId),
          eq(schema.pushSubscriptions.tenantId, tenantId),
        ),
      );
    const memories = await db
      .select()
      .from(schema.memoryEmbeddings)
      .where(and(eq(schema.memoryEmbeddings.userId, userId), eq(schema.memoryEmbeddings.tenantId, tenantId)));
    const sharedSnapshots = await db
      .select()
      .from(schema.sharedSnapshots)
      .where(and(eq(schema.sharedSnapshots.userId, userId), eq(schema.sharedSnapshots.tenantId, tenantId)));
    const telemetry = await db
      .select()
      .from(schema.chatTelemetry)
      .where(and(eq(schema.chatTelemetry.userId, userId), eq(schema.chatTelemetry.tenantId, tenantId)));
    const spend = await db
      .select()
      .from(schema.dailyAiSpend)
      .where(and(eq(schema.dailyAiSpend.userId, userId), eq(schema.dailyAiSpend.tenantId, tenantId)));
    const briefings = await db
      .select()
      .from(schema.briefingsEmitted)
      .where(and(eq(schema.briefingsEmitted.userId, userId), eq(schema.briefingsEmitted.tenantId, tenantId)));
    const auditLogs = await db
      .select()
      .from(schema.auditLogs)
      .where(and(eq(schema.auditLogs.userId, userId), eq(schema.auditLogs.tenantId, tenantId)));
    const [portfolioPositions, portfolioSettings, providerTests, notificationNoiseState, botLinks, rateLimits, toolTelemetry, feedback, regressionCases, shadowComparisons, qualityResults, fullAnalysisQueue, persistenceOutbox, mutationExecutions, budgetReservations, agentOpinions, traces, memoryBackfillState, memoryProjectionState, billingSubscriptions, billingPayments] =
      await Promise.all([
        db
          .select()
          .from(schema.portfolioPositions)
          .where(and(eq(schema.portfolioPositions.userId, userId), eq(schema.portfolioPositions.tenantId, tenantId))),
        db
          .select()
          .from(schema.portfolioSettings)
          .where(and(eq(schema.portfolioSettings.userId, userId), eq(schema.portfolioSettings.tenantId, tenantId))),
        db
          .select()
          .from(schema.providerTests)
          .where(and(eq(schema.providerTests.userId, userId), eq(schema.providerTests.tenantId, tenantId))),
        db
          .select()
          .from(schema.notificationNoiseState)
          .where(and(eq(schema.notificationNoiseState.userId, userId), eq(schema.notificationNoiseState.tenantId, tenantId))),
        db
          .select()
          .from(schema.botLinks)
          .where(and(eq(schema.botLinks.userId, userId), eq(schema.botLinks.tenantId, tenantId))),
        db
          .select()
          .from(schema.rateLimits)
          .where(and(eq(schema.rateLimits.userId, userId), eq(schema.rateLimits.tenantId, tenantId))),
        db
          .select()
          .from(schema.chatToolTelemetry)
          .where(and(eq(schema.chatToolTelemetry.userId, userId), eq(schema.chatToolTelemetry.tenantId, tenantId))),
        db
          .select()
          .from(schema.aiMessageFeedback)
          .where(and(eq(schema.aiMessageFeedback.userId, userId), eq(schema.aiMessageFeedback.tenantId, tenantId))),
        db
          .select()
          .from(schema.aiRegressionCases)
          .where(and(eq(schema.aiRegressionCases.userId, userId), eq(schema.aiRegressionCases.tenantId, tenantId))),
        db
          .select()
          .from(schema.aiShadowComparisons)
          .where(and(eq(schema.aiShadowComparisons.userId, userId), eq(schema.aiShadowComparisons.tenantId, tenantId))),
        db
          .select()
          .from(schema.aiQualityResults)
          .where(and(eq(schema.aiQualityResults.userId, userId), eq(schema.aiQualityResults.tenantId, tenantId))),
        db
          .select()
          .from(schema.fullAnalysisQueue)
          .where(and(eq(schema.fullAnalysisQueue.userId, userId), eq(schema.fullAnalysisQueue.tenantId, tenantId))),
        db
          .select()
          .from(schema.persistenceOutbox)
          .where(and(eq(schema.persistenceOutbox.userId, userId), eq(schema.persistenceOutbox.tenantId, tenantId))),
        db
          .select()
          .from(schema.mutationExecutions)
          .where(and(eq(schema.mutationExecutions.userId, userId), eq(schema.mutationExecutions.tenantId, tenantId))),
        db
          .select()
          .from(schema.aiBudgetReservations)
          .where(and(eq(schema.aiBudgetReservations.userId, userId), eq(schema.aiBudgetReservations.tenantId, tenantId))),
        db
          .select()
          .from(schema.agentOpinions)
          .where(and(eq(schema.agentOpinions.userId, userId), eq(schema.agentOpinions.tenantId, tenantId))),
        db
          .select()
          .from(schema.diagnosticTraces)
          .where(eq(schema.diagnosticTraces.userId, userId)),
        db
          .select()
          .from(schema.memoryBackfillState)
          .where(and(eq(schema.memoryBackfillState.userId, userId), eq(schema.memoryBackfillState.tenantId, tenantId))),
        db
          .select()
          .from(schema.memoryProjectionState)
          .where(and(eq(schema.memoryProjectionState.userId, userId), eq(schema.memoryProjectionState.tenantId, tenantId))),
        db
          .select()
          .from(schema.subscriptions)
          .where(eq(schema.subscriptions.tenantId, tenantId)),
        db
          .select()
          .from(schema.payments)
          .where(eq(schema.payments.tenantId, tenantId)),
      ]);

    // Strip identity and secret material from exported records. OAuth rows,
    // password hashes, TOTP state, and encrypted integration credentials are
    // intentionally excluded rather than serialized with undefined values.
    const data = {
      exportedAt: new Date().toISOString(),
      profile: profile
        ? {
            id: profile.id,
            email: profile.email,
            name: profile.name,
            image: profile.image,
            role: profile.role,
            deletedAt: profile.deletedAt,
            createdAt: profile.createdAt,
            updatedAt: profile.updatedAt,
          }
        : null,
      settings: settings.map(({ userId: _userId, aiApiKeys: _aiApiKeys, telegramBotToken: _telegramBotToken, ...safe }) => safe),
      threads: threads.map(({ userId: _userId, ...thread }) => thread),
      messages: messages.map(({ message }) => message),
      journalEntries: journalEntries.map(({ userId: _userId, ...entry }) => entry),
      alerts: alerts.map(({ userId: _userId, ...alert }) => alert),
      symbols: symbols.map(({ userId: _userId, ...symbol }) => symbol),
      pushSubscriptions: pushSubscriptions.map(({ userId: _userId, ...subscription }) => subscription),
      memories: memories.map(({ userId: _userId, ...memory }) => memory),
      sharedSnapshots: sharedSnapshots.map(({ userId: _userId, ...snapshot }) => snapshot),
      telemetry: telemetry.map(({ userId: _userId, ...turn }) => turn),
      toolTelemetry: toolTelemetry.map(({ userId: _userId, ...tool }) => tool),
      spend: spend.map(({ userId: _userId, ...row }) => row),
      budgetReservations: budgetReservations.map(({ userId: _userId, ...row }) => row),
      briefings: briefings.map(({ userId: _userId, ...briefing }) => briefing),
      portfolioPositions: portfolioPositions.map(({ userId: _userId, ...position }) => position),
      portfolioSettings: portfolioSettings.map(({ userId: _userId, ...portfolio }) => portfolio),
      providerTests: providerTests.map(({ userId: _userId, ...test }) => test),
      notificationNoiseState: notificationNoiseState.map(({ userId: _userId, ...state }) => state),
      botLinks: botLinks.map(({ userId: _userId, ...link }) => link),
      rateLimits: rateLimits.map(({ userId: _userId, ...limit }) => limit),
      feedback: feedback.map(({ userId: _userId, ...row }) => row),
      regressionCases: regressionCases.map(({ userId: _userId, ...row }) => row),
      shadowComparisons: shadowComparisons.map(({ userId: _userId, ...row }) => row),
      qualityResults: qualityResults.map(({ userId: _userId, ...row }) => row),
      fullAnalysisQueue: fullAnalysisQueue.map(({ userId: _userId, ...row }) => row),
      persistenceOutbox: persistenceOutbox.map(({ userId: _userId, ...row }) => row),
      mutationExecutions: mutationExecutions.map(({ userId: _userId, ...row }) => row),
      agentOpinions: agentOpinions.map(({ userId: _userId, ...opinion }) => opinion),
      traces: traces.map(({ userId: _userId, ...trace }) => trace),
      memoryBackfillState: memoryBackfillState.map(({ userId: _userId, ...row }) => row),
      memoryProjectionState: memoryProjectionState.map(({ userId: _userId, ...row }) => row),
      subscriptions: billingSubscriptions,
      payments: billingPayments,
      auditLogs: auditLogs.map(({ userId: _userId, ...audit }) => audit),
    };

    return {
      ok: true as const,
      data: JSON.stringify(data, null, 2),
    };
  } catch (err) {
    Sentry.captureException(err);
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
