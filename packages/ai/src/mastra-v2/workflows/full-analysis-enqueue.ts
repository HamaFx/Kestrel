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

// Durable Full-analysis admission (queue row + budget reservation).

import { requireTenantIdForUser, schema } from '@kestrel/db';
import { UserMessagePartsSchema } from '@kestrel/shared';
import { and, eq } from 'drizzle-orm';

import { reserveTurnBudget } from '../../budget';
import { getDb } from '../../runtime/db';
import { ExecutionPlanSchema } from '../planning/execution-plan';
import { flog, serializeError } from './full-analysis-payload';
import { projectQueueRow } from './full-analysis-projection';
import {
  FULL_ANALYSIS_ESTIMATE_USD,
  fullAnalysisRunId,
  type FullAnalysisEnqueueInput,
  type FullAnalysisPayload,
} from './full-analysis-types';

export async function enqueueFullAnalysis(input: FullAnalysisEnqueueInput): Promise<string | null> {
  try {
    const runId = fullAnalysisRunId(input.userId, input.idempotencyKey);
    const payload: FullAnalysisPayload = {
      kind: 'full-analysis',
      version: 1,
      userId: input.userId,
      threadId: input.threadId,
      userMessageText: input.userMessageText,
      userMessageParts: UserMessagePartsSchema.parse(input.userMessageParts),
      idempotencyKey: input.idempotencyKey,
      ...(input.traceId ? { traceId: input.traceId } : {}),
      modelSnapshot: input.modelSnapshot,
      providerMode: input.providerMode ?? 'managed',
      ...(input.executionPlan
        ? { executionPlan: ExecutionPlanSchema.parse(input.executionPlan) }
        : {}),
      ...(input.ledgerSnapshot
        ? {
            ledgerSnapshot: { ...input.ledgerSnapshot, entries: [...input.ledgerSnapshot.entries] },
          }
        : {}),
      attemptCount: 0,
      createdAt: new Date().toISOString(),
    };
    const db = getDb();
    const tenantId = await requireTenantIdForUser(input.userId, db);
    const row = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(schema.fullAnalysisQueue)
        .values({
          runId,
          userId: input.userId,
          tenantId,
          threadId: input.threadId,
          idempotencyKey: input.idempotencyKey,
          payload,
          status: 'pending',
          attemptCount: 0,
        })
        .onConflictDoNothing({
          target: [schema.fullAnalysisQueue.userId, schema.fullAnalysisQueue.idempotencyKey],
        })
        .returning();
      const existing =
        inserted[0] ??
        (
          await tx
            .select()
            .from(schema.fullAnalysisQueue)
            .where(
              and(
                eq(schema.fullAnalysisQueue.userId, input.userId),
                eq(schema.fullAnalysisQueue.idempotencyKey, input.idempotencyKey),
              ),
            )
            .limit(1)
        )[0];
      if (!existing) throw new Error('Full-analysis queue row was not available after enqueue.');
      if (!inserted[0]) return existing;

      const reservation = await reserveTurnBudget({
        userId: input.userId,
        estimateUsd: FULL_ANALYSIS_ESTIMATE_USD,
        maxDailyUsd: input.maxDailyUsd,
        correlation: { threadId: input.threadId, runId },
        db: tx,
        tenantId,
      });
      const updated = await tx
        .update(schema.fullAnalysisQueue)
        .set({
          payload: {
            ...payload,
            ...(reservation.reservationId
              ? { budgetReservationId: reservation.reservationId }
              : {}),
            providerMode: input.providerMode ?? 'managed',
          },
        })
        .where(eq(schema.fullAnalysisQueue.runId, runId))
        .returning();
      return updated[0] ?? existing;
    });
    await projectQueueRow(row);
    flog.info('Enqueued full-analysis run', {
      runId,
      userId: input.userId,
      threadId: input.threadId,
      queueAuthority: 'database',
    });
    return runId;
  } catch (error) {
    flog.error('Failed to enqueue full-analysis run', {
      userId: input.userId,
      threadId: input.threadId,
      error: serializeError(error),
    });
    return null;
  }
}
