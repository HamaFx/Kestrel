/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

// Read/point-lookup helpers for the Full-analysis queue.

import { and, asc, eq } from 'drizzle-orm';

import { getDb, schema, type DbClient } from '../../client';
import type {
  FullAnalysisQueueRow,
  FullAnalysisQueueStatus,
} from '../../schema/ai/full-analysis-queue';
import { requireTenantIdForUser } from '../../tenant';

export async function getFullAnalysisQueueRow(
  runId: string,
  userId?: string,
  db: DbClient = getDb(),
): Promise<FullAnalysisQueueRow | null> {
  const conditions = [eq(schema.fullAnalysisQueue.runId, runId)];
  if (userId) {
    const tenantId = await requireTenantIdForUser(userId, db);
    conditions.push(
      eq(schema.fullAnalysisQueue.userId, userId),
      eq(schema.fullAnalysisQueue.tenantId, tenantId),
    );
  }
  const rows = await db
    .select()
    .from(schema.fullAnalysisQueue)
    .where(and(...conditions))
    .limit(1);
  return rows[0] ?? null;
}

export async function listFullAnalysisQueueRows(
  status?: FullAnalysisQueueStatus,
  db: DbClient = getDb(),
  limit = 200,
): Promise<FullAnalysisQueueRow[]> {
  return db
    .select()
    .from(schema.fullAnalysisQueue)
    .where(status ? eq(schema.fullAnalysisQueue.status, status) : undefined)
    .orderBy(asc(schema.fullAnalysisQueue.createdAt))
    .limit(Math.max(1, Math.min(limit, 1000)));
}
