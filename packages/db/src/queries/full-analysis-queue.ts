/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { and, asc, eq, gt, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm';

import { getDb, schema, type DbClient } from '../client';
import { metrics } from '@kestrel/shared';
import type {
  FullAnalysisQueueRow,
  FullAnalysisQueueStatus,
} from '../schema/full-analysis-queue';

export interface EnqueueFullAnalysisQueueInput {
  runId: string;
  userId: string;
  threadId: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  db?: DbClient;
}

export interface ClaimFullAnalysisQueueOptions {
  workerRunId: string;
  leaseMs: number;
  /** Optional tenant partition predicate evaluated before the atomic claim. */
  ownsTenant?: (userId: string) => boolean;
  db?: DbClient;
}

export interface FullAnalysisLeaseInput {
  runId: string;
  workerRunId: string;
  db?: DbClient;
}

export class FullAnalysisQueueOwnershipError extends Error {
  readonly code = 'FULL_ANALYSIS_QUEUE_OWNERSHIP_LOST';

  constructor(message = 'The Full-analysis worker lease is no longer owned.') {
    super(message);
    this.name = 'FullAnalysisQueueOwnershipError';
  }
}

export class FullAnalysisQueuePayloadError extends Error {
  readonly code = 'FULL_ANALYSIS_QUEUE_PAYLOAD_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'FullAnalysisQueuePayloadError';
  }
}

export async function enqueueFullAnalysisQueue(
  input: EnqueueFullAnalysisQueueInput,
): Promise<FullAnalysisQueueRow> {
  const db = input.db ?? getDb();
  await db
    .insert(schema.fullAnalysisQueue)
    .values({
      runId: input.runId,
      userId: input.userId,
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

/**
 * Atomically claim one pending row. Concurrent workers may read the same
 * candidate, but only one conditional UPDATE can return it.
 */
export async function claimNextFullAnalysisQueue(
  options: ClaimFullAnalysisQueueOptions,
): Promise<FullAnalysisQueueRow | null> {
  const db = options.db ?? getDb();
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + options.leaseMs);
  const candidates = await db
    .select({ runId: schema.fullAnalysisQueue.runId, userId: schema.fullAnalysisQueue.userId })
    .from(schema.fullAnalysisQueue)
    .where(eq(schema.fullAnalysisQueue.status, 'pending'))
    .orderBy(asc(schema.fullAnalysisQueue.createdAt))
    .limit(100);

  for (const candidate of candidates) {
    if (options.ownsTenant && !options.ownsTenant(candidate.userId)) continue;
    const claimed = await db
      .update(schema.fullAnalysisQueue)
      .set({
        status: 'running',
        attemptCount: sql`${schema.fullAnalysisQueue.attemptCount} + 1`,
        workerRunId: options.workerRunId,
        leaseExpiresAt,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.fullAnalysisQueue.runId, candidate.runId),
          eq(schema.fullAnalysisQueue.status, 'pending'),
          or(
            isNull(schema.fullAnalysisQueue.leaseExpiresAt),
            lte(schema.fullAnalysisQueue.leaseExpiresAt, now),
          ),
        ),
      )
      .returning();
    if (claimed[0]) return claimed[0];
  }
  // No claim succeeded — every candidate was taken by another worker in the race.
  if (candidates.length > 0) metrics.increment('queue_duplicate_claim_total');
  return null;
}

async function updateOwnedQueueRow(
  input: FullAnalysisLeaseInput,
  status: FullAnalysisQueueStatus,
  values: Record<string, unknown>,
): Promise<FullAnalysisQueueRow> {
  const db = input.db ?? getDb();
  const rows = await db
    .update(schema.fullAnalysisQueue)
    .set({
      ...values,
      status,
      updatedAt: new Date(),
    } as never)
    .where(
      and(
        eq(schema.fullAnalysisQueue.runId, input.runId),
        eq(schema.fullAnalysisQueue.workerRunId, input.workerRunId),
        eq(schema.fullAnalysisQueue.status, 'running'),
        gt(schema.fullAnalysisQueue.leaseExpiresAt, new Date()),
      ),
    )
    .returning();
  const row = rows[0];
  if (!row) {
    if (status === 'complete') metrics.increment('queue_stale_lease_completion_total');
    throw new FullAnalysisQueueOwnershipError();
  }
  return row;
}

export async function heartbeatFullAnalysisQueue(
  input: FullAnalysisLeaseInput & { leaseMs: number },
): Promise<FullAnalysisQueueRow> {
  const db = input.db ?? getDb();
  const now = new Date();
  const rows = await db
    .update(schema.fullAnalysisQueue)
    .set({
      leaseExpiresAt: new Date(now.getTime() + input.leaseMs),
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.fullAnalysisQueue.runId, input.runId),
        eq(schema.fullAnalysisQueue.workerRunId, input.workerRunId),
        eq(schema.fullAnalysisQueue.status, 'running'),
        gt(schema.fullAnalysisQueue.leaseExpiresAt, new Date()),
      ),
    )
    .returning();
  const row = rows[0];
  if (!row) {
    metrics.increment('queue_stale_lease_completion_total');
    throw new FullAnalysisQueueOwnershipError();
  }
  return row;
}

export async function completeFullAnalysisQueue(
  input: FullAnalysisLeaseInput & { result: Record<string, unknown> },
): Promise<FullAnalysisQueueRow> {
  return updateOwnedQueueRow(input, 'complete', {
    result: input.result,
    leaseExpiresAt: null,
    completedAt: new Date(),
    error: null,
  });
}

export async function failFullAnalysisQueue(
  input: FullAnalysisLeaseInput & { error: string },
): Promise<FullAnalysisQueueRow> {
  return updateOwnedQueueRow(input, 'failed', {
    error: input.error,
    leaseExpiresAt: null,
    completedAt: new Date(),
  });
}

export async function requeueFullAnalysisQueue(
  input: FullAnalysisLeaseInput & { error: string },
): Promise<FullAnalysisQueueRow> {
  return updateOwnedQueueRow(input, 'pending', {
    error: input.error,
    workerRunId: null,
    leaseExpiresAt: null,
  });
}

export async function recoverStaleFullAnalysisQueue(
  staleBefore: Date,
  maxAttempts: number,
  db: DbClient = getDb(),
): Promise<{ requeued: number; failed: number; runIds: string[] }> {
  const stale = await db
    .select()
    .from(schema.fullAnalysisQueue)
    .where(
      and(
        eq(schema.fullAnalysisQueue.status, 'running'),
        or(
          lte(schema.fullAnalysisQueue.leaseExpiresAt, new Date()),
          lte(schema.fullAnalysisQueue.updatedAt, staleBefore),
        ),
      ),
    );
  let requeued = 0;
  let failed = 0;
  const runIds: string[] = [];
  for (const row of stale) {
    const nextStatus = row.attemptCount < maxAttempts ? 'pending' : 'failed';
    const updated = await db
      .update(schema.fullAnalysisQueue)
      .set({
        status: nextStatus,
        workerRunId: null,
        leaseExpiresAt: null,
        error:
          nextStatus === 'failed'
            ? 'Job timed out — maximum worker attempts reached.'
            : 'Worker lease expired; requeued for retry.',
        completedAt: nextStatus === 'failed' ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.fullAnalysisQueue.runId, row.runId),
          eq(schema.fullAnalysisQueue.status, 'running'),
          row.workerRunId
            ? eq(schema.fullAnalysisQueue.workerRunId, row.workerRunId)
            : isNull(schema.fullAnalysisQueue.workerRunId),
        ),
      )
      .returning({ runId: schema.fullAnalysisQueue.runId });
    if (updated.length === 0) continue;
    runIds.push(row.runId);
    if (nextStatus === 'pending') requeued += 1;
    else failed += 1;
  }
  return { requeued, failed, runIds };
}

export async function purgeOldFullAnalysisQueue(
  retentionCutoff: Date,
  db: DbClient = getDb(),
): Promise<number> {
  const rows = await db
    .delete(schema.fullAnalysisQueue)
    .where(
      and(
        inArray(schema.fullAnalysisQueue.status, ['complete', 'failed']),
        lt(schema.fullAnalysisQueue.updatedAt, retentionCutoff),
      ),
    )
    .returning({ runId: schema.fullAnalysisQueue.runId });
  return rows.length;
}

export async function getFullAnalysisQueueRow(
  runId: string,
  userId?: string,
  db: DbClient = getDb(),
): Promise<FullAnalysisQueueRow | null> {
  const conditions = [eq(schema.fullAnalysisQueue.runId, runId)];
  if (userId) conditions.push(eq(schema.fullAnalysisQueue.userId, userId));
  const rows = await db.select().from(schema.fullAnalysisQueue).where(and(...conditions)).limit(1);
  return rows[0] ?? null;
}

export async function listFullAnalysisQueueRows(
  status?: FullAnalysisQueueStatus,
  db: DbClient = getDb(),
): Promise<FullAnalysisQueueRow[]> {
  return db
    .select()
    .from(schema.fullAnalysisQueue)
    .where(status ? eq(schema.fullAnalysisQueue.status, status) : undefined)
    .orderBy(asc(schema.fullAnalysisQueue.createdAt));
}
