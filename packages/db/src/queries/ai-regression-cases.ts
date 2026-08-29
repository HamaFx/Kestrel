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

import { createHash } from 'node:crypto';

import { and, asc, desc, eq, sql } from 'drizzle-orm';

import { getDb, schema } from '../client';
import { requireTenantIdForUser } from '../tenant';
import type { RegressionCaseStatus } from '../schema/ai-regression-cases';

export type AiRegressionCaseRow = typeof schema.aiRegressionCases.$inferSelect;

export interface ListAiRegressionCasesOptions {
  limit?: number;
  offset?: number;
  status?: RegressionCaseStatus;
  /** Restrict results for non-admin callers. */
  userId?: string;
}

/**
 * Synchronize a regression case with a reviewed feedback row.
 *
 * A case is opened only for an explicit reviewer `fail` label. If the same
 * feedback is later reclassified, the existing case is dismissed rather than
 * deleted, preserving the audit trail.
 */
export async function syncAiRegressionCase(
  feedbackId: string,
): Promise<AiRegressionCaseRow | null> {
  const db = getDb();
  const feedbackRows = await db
    .select({
      feedback: schema.aiMessageFeedback,
      assistantText: schema.chatMessages.content,
      assistantCreatedAt: schema.chatMessages.createdAt,
    })
    .from(schema.aiMessageFeedback)
    .innerJoin(schema.chatMessages, eq(schema.chatMessages.id, schema.aiMessageFeedback.messageId))
    .innerJoin(schema.chatThreads, eq(schema.chatThreads.id, schema.aiMessageFeedback.threadId))
    .where(
      and(
        eq(schema.aiMessageFeedback.id, feedbackId),
        eq(schema.chatMessages.threadId, schema.aiMessageFeedback.threadId),
        eq(schema.chatThreads.userId, schema.aiMessageFeedback.userId),
        eq(schema.chatThreads.tenantId, schema.aiMessageFeedback.tenantId),
        eq(schema.chatMessages.tenantId, schema.aiMessageFeedback.tenantId),
        eq(schema.chatThreads.id, schema.chatMessages.threadId),
      ),
    )
    .limit(1);
  const source = feedbackRows[0];
  if (!source) return null;

  const prompt = await findNearestPrompt(
    source.feedback.threadId,
    source.feedback.userId,
    source.feedback.tenantId,
    source.assistantCreatedAt,
  );
  const isFailure =
    source.feedback.reviewStatus === 'reviewed' && source.feedback.reviewerLabel === 'fail';

  if (!isFailure) {
    await db
      .update(schema.aiRegressionCases)
      .set({ status: 'dismissed', updatedAt: new Date() })
      .where(
      and(
        eq(schema.aiRegressionCases.feedbackId, feedbackId),
        eq(schema.aiRegressionCases.userId, source.feedback.userId),
        eq(schema.aiRegressionCases.tenantId, source.feedback.tenantId),
      ),
    );
    return null;
  }

  const [row] = await db
    .insert(schema.aiRegressionCases)
    .values({
      feedbackId,
      userId: source.feedback.userId,
      tenantId: source.feedback.tenantId,
      threadId: source.feedback.threadId,
      messageId: source.feedback.messageId,
      promptSha256: sha256(prompt),
      assistantOutputSha256: sha256(source.assistantText),
      issueCodes: source.feedback.issueCodes ?? [],
      reviewerNote: source.feedback.reviewerNote,
      status: 'open',
    })
    .onConflictDoUpdate({
      target: schema.aiRegressionCases.feedbackId,
      set: {
        promptSha256: sha256(prompt),
        assistantOutputSha256: sha256(source.assistantText),
        issueCodes: source.feedback.issueCodes ?? [],
        reviewerNote: source.feedback.reviewerNote,
        status: 'open',
        updatedAt: new Date(),
      },
    })
    .returning();

  return row ?? null;
}

export async function listAiRegressionCases(
  options: ListAiRegressionCasesOptions = {},
): Promise<AiRegressionCaseRow[]> {
  const db = getDb();
  const conditions = [];
  if (options.status) conditions.push(eq(schema.aiRegressionCases.status, options.status));
  if (options.userId) {
    const tenantId = await requireTenantIdForUser(options.userId, db);
    conditions.push(
      eq(schema.aiRegressionCases.userId, options.userId),
      eq(schema.aiRegressionCases.tenantId, tenantId),
    );
  }

  return db
    .select()
    .from(schema.aiRegressionCases)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.aiRegressionCases.updatedAt))
    .limit(Math.min(500, Math.max(1, options.limit ?? 100)))
    .offset(Math.max(0, options.offset ?? 0));
}

export async function updateAiRegressionCaseStatus(
  id: string,
  status: RegressionCaseStatus,
  userId?: string,
): Promise<AiRegressionCaseRow | null> {
  const db = getDb();
  const tenantId = userId ? await requireTenantIdForUser(userId, db) : null;
  const [row] = await db
    .update(schema.aiRegressionCases)
    .set({ status, updatedAt: new Date() })
    .where(
      userId
        ? and(
            eq(schema.aiRegressionCases.id, id),
            eq(schema.aiRegressionCases.userId, userId),
            eq(schema.aiRegressionCases.tenantId, tenantId!),
          )
        : eq(schema.aiRegressionCases.id, id),
    )
    .returning();
  return row ?? null;
}

async function findNearestPrompt(
  threadId: string,
  sourceOwnerId: string,
  tenantId: string,
  assistantCreatedAt: Date,
): Promise<string> {
  const rows = await getDb()
    .select({ content: schema.chatMessages.content })
    .from(schema.chatMessages)
    .innerJoin(schema.chatThreads, eq(schema.chatMessages.threadId, schema.chatThreads.id))
    .where(
      and(
        eq(schema.chatMessages.threadId, threadId),
        eq(schema.chatThreads.id, threadId),
        eq(schema.chatThreads.userId, sourceOwnerId),
        eq(schema.chatThreads.tenantId, tenantId),
        eq(schema.chatMessages.tenantId, tenantId),
        eq(schema.chatMessages.role, 'user'),
        sql`${schema.chatMessages.createdAt} < ${assistantCreatedAt}`,
      ),
    )
    .orderBy(desc(schema.chatMessages.createdAt), asc(schema.chatMessages.id))
    .limit(1);
  return rows[0]?.content ?? '';
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
