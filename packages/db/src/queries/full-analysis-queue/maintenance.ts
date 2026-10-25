/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

// Retention sweeps: stale-lease recovery and completed-row purge.

import { and, eq, gte, inArray, isNull, lt, lte, or } from 'drizzle-orm';

import { getDb, schema, type DbClient } from '../../client';

export async function recoverStaleFullAnalysisQueue(
  staleBefore: Date,
  maxAttempts: number,
  db: DbClient = getDb(),
): Promise<{ requeued: number; failed: number; runIds: string[] }> {
  const now = new Date();
  const stalePredicate = and(
    eq(schema.fullAnalysisQueue.status, 'running'),
    or(
      lte(schema.fullAnalysisQueue.leaseExpiresAt, now),
      // Unconditional heartbeat-fallback (pre-perf-refactor contract): a
      // running row not updated since `staleBefore` is recovered even if its
      // lease timestamp still sits in the future.
      lte(schema.fullAnalysisQueue.updatedAt, staleBefore),
    ),
  );

  // Two set-based UPDATEs replace the previous unbounded SELECT + N+1 loop.
  // Requeue attempts that still have budget; fail the rest in one statement.
  const requeuedRows = await db
    .update(schema.fullAnalysisQueue)
    .set({
      status: 'pending',
      workerRunId: null,
      leaseExpiresAt: null,
      error: 'Worker lease expired; requeued for retry.',
      completedAt: null,
      updatedAt: now,
    })
    .where(and(stalePredicate, lt(schema.fullAnalysisQueue.attemptCount, maxAttempts)))
    .returning({ runId: schema.fullAnalysisQueue.runId });

  const failedRows = await db
    .update(schema.fullAnalysisQueue)
    .set({
      status: 'failed',
      workerRunId: null,
      leaseExpiresAt: null,
      error: 'Job timed out — maximum worker attempts reached.',
      completedAt: now,
      updatedAt: now,
    })
    .where(and(stalePredicate, gte(schema.fullAnalysisQueue.attemptCount, maxAttempts)))
    .returning({ runId: schema.fullAnalysisQueue.runId });

  const runIds = [...requeuedRows.map((r) => r.runId), ...failedRows.map((r) => r.runId)];
  return { requeued: requeuedRows.length, failed: failedRows.length, runIds };
}

export async function purgeOldFullAnalysisQueue(
  retentionCutoff: Date,
  db: DbClient = getDb(),
): Promise<number> {
  const rows = await purgeOldFullAnalysisQueueWithIds(retentionCutoff, db);
  return rows.length;
}

export async function purgeOldFullAnalysisQueueWithIds(
  retentionCutoff: Date,
  db: DbClient = getDb(),
): Promise<string[]> {
  const rows = await db
    .delete(schema.fullAnalysisQueue)
    .where(
      and(
        inArray(schema.fullAnalysisQueue.status, ['succeeded', 'failed', 'cancelled', 'blocked']),
        or(
          lt(schema.fullAnalysisQueue.completedAt, retentionCutoff),
          and(
            isNull(schema.fullAnalysisQueue.completedAt),
            lt(schema.fullAnalysisQueue.updatedAt, retentionCutoff),
          ),
        ),
      ),
    )
    .returning({ runId: schema.fullAnalysisQueue.runId });
  return rows.map((r) => r.runId);
}
