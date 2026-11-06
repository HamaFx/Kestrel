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

// Tenant-scoped data-export payload builder: reads every user-owned domain
// and strips identity and secret material before serialization. This module
// exports a plain server helper, so it must not carry a "use server"
// directive.
//
// the builder is called from a server action, which
// inherits no tenant scope. Every query below runs on a tenant RLS table;
// unscoped under `kestrel_app` each one would return zero rows and the export
// would silently omit the user's data.

import { requireTenantIdForUser, schema, withUserTenant, type DbClient } from '@kestrel/db';
import { and, eq, inArray } from 'drizzle-orm';

export async function buildUserDataExport(userId: string): Promise<string> {
  return withUserTenant(userId, (db) => collectUserDataExport(userId, db));
}

async function collectUserDataExport(userId: string, db: DbClient): Promise<string> {
  const tenantId = await requireTenantIdForUser(userId, db);

  const [profile] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  const settings = await db
    .select()
    .from(schema.userSettings)
    .where(and(eq(schema.userSettings.userId, userId), eq(schema.userSettings.tenantId, tenantId)));
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
    .where(
      and(eq(schema.journalEntries.userId, userId), eq(schema.journalEntries.tenantId, tenantId)),
    );
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
    .where(
      and(
        eq(schema.memoryEmbeddings.userId, userId),
        eq(schema.memoryEmbeddings.tenantId, tenantId),
      ),
    );
  const sharedSnapshots = await db
    .select()
    .from(schema.sharedSnapshots)
    .where(
      and(eq(schema.sharedSnapshots.userId, userId), eq(schema.sharedSnapshots.tenantId, tenantId)),
    );
  const telemetry = await db
    .select()
    .from(schema.chatTelemetry)
    .where(
      and(eq(schema.chatTelemetry.userId, userId), eq(schema.chatTelemetry.tenantId, tenantId)),
    );
  const spend = await db
    .select()
    .from(schema.dailyAiSpend)
    .where(and(eq(schema.dailyAiSpend.userId, userId), eq(schema.dailyAiSpend.tenantId, tenantId)));
  const briefings = await db
    .select()
    .from(schema.briefingsEmitted)
    .where(
      and(
        eq(schema.briefingsEmitted.userId, userId),
        eq(schema.briefingsEmitted.tenantId, tenantId),
      ),
    );
  const auditLogs = await db
    .select()
    .from(schema.auditLogs)
    .where(and(eq(schema.auditLogs.userId, userId), eq(schema.auditLogs.tenantId, tenantId)));
  // Plugin platform rows (P2-6). Secret settings fields are stored as
  // AES-256-GCM ciphertext by the install ledger, never as plaintext.
  const installedPlugins = await db
    .select({
      pluginId: schema.userInstalledPlugins.pluginId,
      enabled: schema.userInstalledPlugins.enabled,
      settings: schema.userInstalledPlugins.settings,
      onboardingCompleted: schema.userInstalledPlugins.onboardingCompleted,
      installedAt: schema.userInstalledPlugins.installedAt,
      updatedAt: schema.userInstalledPlugins.updatedAt,
    })
    .from(schema.userInstalledPlugins)
    .where(
      and(
        eq(schema.userInstalledPlugins.userId, userId),
        eq(schema.userInstalledPlugins.tenantId, tenantId),
      ),
    );
  const pluginStorage = await db
    .select({
      pluginId: schema.pluginStorage.pluginId,
      collection: schema.pluginStorage.collection,
      key: schema.pluginStorage.key,
      value: schema.pluginStorage.value,
      createdAt: schema.pluginStorage.createdAt,
      updatedAt: schema.pluginStorage.updatedAt,
    })
    .from(schema.pluginStorage)
    .where(
      and(eq(schema.pluginStorage.userId, userId), eq(schema.pluginStorage.tenantId, tenantId)),
    );
  const [
    providerTests,
    botLinks,
    rateLimits,
    toolTelemetry,
    feedback,
    mutationExecutions,
    budgetReservations,
    agentOpinions,
    traces,
    memoryBackfillState,
  ] = await Promise.all([
    db
      .select()
      .from(schema.providerTests)
      .where(
        and(eq(schema.providerTests.userId, userId), eq(schema.providerTests.tenantId, tenantId)),
      ),
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
      .where(
        and(
          eq(schema.chatToolTelemetry.userId, userId),
          eq(schema.chatToolTelemetry.tenantId, tenantId),
        ),
      ),
    db
      .select()
      .from(schema.aiMessageFeedback)
      .where(
        and(
          eq(schema.aiMessageFeedback.userId, userId),
          eq(schema.aiMessageFeedback.tenantId, tenantId),
        ),
      ),
    db
      .select()
      .from(schema.mutationExecutions)
      .where(
        and(
          eq(schema.mutationExecutions.userId, userId),
          eq(schema.mutationExecutions.tenantId, tenantId),
        ),
      ),
    db
      .select()
      .from(schema.aiBudgetReservations)
      .where(
        and(
          eq(schema.aiBudgetReservations.userId, userId),
          eq(schema.aiBudgetReservations.tenantId, tenantId),
        ),
      ),
    db
      .select()
      .from(schema.agentOpinions)
      .where(
        and(eq(schema.agentOpinions.userId, userId), eq(schema.agentOpinions.tenantId, tenantId)),
      ),
    db.select().from(schema.diagnosticTraces).where(eq(schema.diagnosticTraces.userId, userId)),
    db
      .select()
      .from(schema.memoryBackfillState)
      .where(
        and(
          eq(schema.memoryBackfillState.userId, userId),
          eq(schema.memoryBackfillState.tenantId, tenantId),
        ),
      ),
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
    settings: settings.map(
      ({ userId: _userId, aiApiKeys: _aiApiKeys, telegramBotToken: _telegramBotToken, ...safe }) =>
        safe,
    ),
    threads: threads.map(({ userId: _userId, ...thread }) => thread),
    messages: messages.map(({ message }) => message),
    journalEntries: journalEntries.map(({ userId: _userId, ...entry }) => entry),
    alerts: alerts.map(({ userId: _userId, ...alert }) => alert),
    symbols: symbols.map(({ userId: _userId, ...symbol }) => symbol),
    pushSubscriptions: pushSubscriptions.map(
      ({ userId: _userId, ...subscription }) => subscription,
    ),
    memories: memories.map(({ userId: _userId, ...memory }) => memory),
    sharedSnapshots: sharedSnapshots.map(({ userId: _userId, ...snapshot }) => snapshot),
    telemetry: telemetry.map(({ userId: _userId, ...turn }) => turn),
    toolTelemetry: toolTelemetry.map(({ userId: _userId, ...tool }) => tool),
    spend: spend.map(({ userId: _userId, ...row }) => row),
    budgetReservations: budgetReservations.map(({ userId: _userId, ...row }) => row),
    briefings: briefings.map(({ userId: _userId, ...briefing }) => briefing),
    providerTests: providerTests.map(({ userId: _userId, ...test }) => test),
    botLinks: botLinks.map(({ userId: _userId, ...link }) => link),
    rateLimits: rateLimits.map(({ userId: _userId, ...limit }) => limit),
    feedback: feedback.map(({ userId: _userId, ...row }) => row),
    mutationExecutions: mutationExecutions.map(({ userId: _userId, ...row }) => row),
    agentOpinions: agentOpinions.map(({ userId: _userId, ...opinion }) => opinion),
    traces: traces.map(({ userId: _userId, ...trace }) => trace),
    memoryBackfillState: memoryBackfillState.map(({ userId: _userId, ...row }) => row),
    auditLogs: auditLogs.map(({ userId: _userId, ...audit }) => audit),
    installedPlugins,
    pluginStorage,
  };

  return JSON.stringify(data, null, 2);
}
