/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

// Enqueue side of the Full-analysis queue. One row per (user, idempotency key).

import { and, eq } from 'drizzle-orm';

import { getDb, schema } from '../../client';
import type { FullAnalysisQueueRow } from '../../schema/ai/full-analysis-queue';
import { requireTenantIdForUser } from '../../tenant';
import type { EnqueueFullAnalysisQueueInput } from './types';

export async function enqueueFullAnalysisQueue(
  input: EnqueueFullAnalysisQueueInput,
): Promise<FullAnalysisQueueRow> {
  const db = input.db ?? getDb();
  const tenantId = await requireTenantIdForUser(input.userId, db);
  await db
    .insert(schema.fullAnalysisQueue)
    .values({
      runId: input.runId,
      userId: input.userId,
      tenantId,
      threadId: input.threadId,
      idempotencyKey: input.idempotencyKey,
      payload: input.payload,
      status: 'pending',
      attemptCount: 0,
    })
    .onConflictDoNothing({
      target: [schema.fullAnalysisQueue.userId, schema.fullAnalysisQueue.idempotencyKey],
    });

  const rows = await db
    .select()
    .from(schema.fullAnalysisQueue)
    .where(
      and(
        eq(schema.fullAnalysisQueue.userId, input.userId),
        eq(schema.fullAnalysisQueue.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) throw new Error('Full-analysis queue row was not available after enqueue.');
  return row;
}
