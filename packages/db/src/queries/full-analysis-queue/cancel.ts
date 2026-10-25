/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

// User-initiated cancellation. Idempotent: cancelling an already-cancelled row
// returns the existing row so the caller can settle the run.

import { and, eq, inArray } from 'drizzle-orm';

import { getDb, schema, type DbClient } from '../../client';
import type { FullAnalysisQueueRow } from '../../schema/ai/full-analysis-queue';
import { requireTenantIdForUser } from '../../tenant';
import { getFullAnalysisQueueRow } from './reads';

export async function cancelFullAnalysisQueue(
  runId: string,
  userId: string,
  db: DbClient = getDb(),
): Promise<FullAnalysisQueueRow | null> {
  const tenantId = await requireTenantIdForUser(userId, db);
  const now = new Date();
  const rows = await db
    .update(schema.fullAnalysisQueue)
    .set({
      status: 'cancelled',
      error: 'Cancelled by user',
      completedAt: now,
      updatedAt: now,
      leaseExpiresAt: null,
    })
    .where(
      and(
        eq(schema.fullAnalysisQueue.runId, runId),
        eq(schema.fullAnalysisQueue.userId, userId),
        eq(schema.fullAnalysisQueue.tenantId, tenantId),
        inArray(schema.fullAnalysisQueue.status, ['pending', 'running']),
      ),
    )
    .returning();
  const row = rows[0];
  if (!row) {
    const existing = await getFullAnalysisQueueRow(runId, userId, db);
    if (existing?.status === 'cancelled') {
      return existing;
    }
    return null;
  }
  return row;
}
