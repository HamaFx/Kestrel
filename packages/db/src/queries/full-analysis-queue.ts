/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { metrics } from '@kestrel/shared';
import { and, asc, eq, gt, gte, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm';

import { getDb, schema, type DbClient } from '../client';
import type { FullAnalysisQueueRow, FullAnalysisQueueStatus } from '../schema/full-analysis-queue';
import { requireTenantIdForUser } from '../tenant';

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
  ownsTenant?: (tenantId: string) => boolean;
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

/**
 * Atomically claim one pending row. Concurrent workers may read the same
 * candidate, but only one conditional UPDATE can return it. Partition
 * predicates receive the persisted tenant ID, never a user ID.
 */
export async function claimNextFullAnalysisQueue(
  options: ClaimFullAnalysisQueueOptions,
): Promise<FullAnalysisQueueRow | null> {
  const db = options.db ?? getDb();
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + options.leaseMs);

  // Fast path — a single atomic CTE. `FOR UPDATE SKIP LOCKED` lets concurrent
  // workers pick distinct rows without thrashing; the outer UPDATE claims the
  // locked row in the same statement so no JS-side retry loop is needed.
  if (!options.ownsTenant) {
    const rows = await db.execute<FullAnalysisQueueRow>(sql`
      WITH next_job AS (
        SELECT run_id
        FROM full_analysis_queue
        WHERE status = 'pending'
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE full_analysis_queue AS q
      SET
        status = 'running',
        worker_run_id = ${options.workerRunId},
        lease_expires_at = ${leaseExpiresAt.toISOString()},
        attempt_count = q.attempt_count + 1,
        updated_at = ${now.toISOString()}
      FROM next_job
      WHERE q.run_id = next_job.run_id
      RETURNING q.*
    `);
    return (rows as unknown as FullAnalysisQueueRow[])[0] ?? null;
  }

  // Tenant-partitioned path — the JS predicate filters candidates before the
  // claim, so we keep the per-candidate conditional UPDATE.
  const candidates = await db
    .select({
      runId: schema.fullAnalysisQueue.runId,
      tenantId: schema.fullAnalysisQueue.tenantId,
    })
    .from(schema.fullAnalysisQueue)
    .where(eq(schema.fullAnalysisQueue.status, 'pending'))
    .orderBy(asc(schema.fullAnalysisQueue.createdAt))
    .limit(100);

  for (const candidate of candidates) {
    if (!options.ownsTenant(candidate.tenantId)) continue;
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
    if (status === 'succeeded') metrics.increment('queue_stale_lease_completion_total');
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

export async function updateFullAnalysisQueueProgress(
  input: FullAnalysisLeaseInput & {
    progress?: Array<Record<string, unknown>>;
    entry?: Record<string, unknown>;
  },
): Promise<FullAnalysisQueueRow> {
  const db = input.db ?? getDb();
  const progressExpr = input.entry
    ? sql`CASE
        WHEN jsonb_array_length(coalesce(${schema.fullAnalysisQueue.progress}, '[]'::jsonb)) >= 50
        THEN (coalesce(${schema.fullAnalysisQueue.progress}, '[]'::jsonb) - 0) || ${JSON.stringify([input.entry])}::jsonb
        ELSE coalesce(${schema.fullAnalysisQueue.progress}, '[]'::jsonb) || ${JSON.stringify([input.entry])}::jsonb
      END`
    : (input.progress ?? []);
  const rows = await db
    .update(schema.fullAnalysisQueue)
    .set({ progress: progressExpr as never, updatedAt: new Date() })
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
  if (!row) throw new FullAnalysisQueueOwnershipError();
  return row;
}

export async function completeFullAnalysisQueue(
  input: FullAnalysisLeaseInput & { result: Record<string, unknown> },
): Promise<FullAnalysisQueueRow> {
  return updateOwnedQueueRow(input, 'succeeded', {
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

export interface FullAnalysisLedgerSnapshotPayload {
  entries: Array<{ id: string; kind: string; costUsd: number }>;
  totalCostUsd: number;
}

/**
 * Requeue a claimed run for another attempt, atomically merging the
 * in-memory generation ledger into the row payload. The next attempt
 * restores exactly the child generations already completed, so cost
 * reconciliation never double-counts billed work (Phase 8).
 */
export async function requeueFullAnalysisQueue(
  input: FullAnalysisLeaseInput & {
    error: string;
    ledgerSnapshot?: FullAnalysisLedgerSnapshotPayload | null;
  },
): Promise<FullAnalysisQueueRow> {
  return updateOwnedQueueRow(input, 'pending', {
    error: input.error,
    workerRunId: null,
    leaseExpiresAt: null,
    ...(input.ledgerSnapshot
      ? {
          payload: sql`jsonb_set(${schema.fullAnalysisQueue.payload}, '{ledgerSnapshot}', ${JSON.stringify(input.ledgerSnapshot)}::jsonb)`,
        }
      : {}),
  });
}

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
      and(
        isNull(schema.fullAnalysisQueue.leaseExpiresAt),
        lte(schema.fullAnalysisQueue.updatedAt, staleBefore),
      ),
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
        inArray(schema.fullAnalysisQueue.status, [
          'succeeded',
          'failed',
          'cancelled',
          'blocked',
        ]),
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

export interface FullAnalysisQueueStats {
  pending: number;
  running: number;
  stalePending: number;
  stuckRunning: number;
}

/**
 * Queue health via one bounded aggregate instead of fetching every pending and
 * running row (including multi-KB `payload` / `progress` / `result` blobs) into
 * Node.js memory. Called on every `/api/health` request.
 */
export async function getFullAnalysisQueueStats(
  db: DbClient = getDb(),
): Promise<FullAnalysisQueueStats> {
  const rows = await db.execute<{
    pending: number | string;
    running: number | string;
    stalePending: number | string;
    stuckRunning: number | string;
  }>(sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'pending')::int AS "pending",
      COUNT(*) FILTER (WHERE status = 'running')::int AS "running",
      COUNT(*) FILTER (
        WHERE status = 'pending' AND created_at < now() - interval '10 minutes'
      )::int AS "stalePending",
      COUNT(*) FILTER (
        WHERE status = 'running'
          AND (
            lease_expires_at <= now()
            OR (lease_expires_at IS NULL AND updated_at < now() - interval '30 seconds')
          )
      )::int AS "stuckRunning"
    FROM full_analysis_queue
  `);
  const row = (rows as unknown as Array<Record<string, unknown>>)[0] ?? {};
  return {
    pending: Number(row['pending'] ?? 0),
    running: Number(row['running'] ?? 0),
    stalePending: Number(row['stalePending'] ?? 0),
    stuckRunning: Number(row['stuckRunning'] ?? 0),
  };
}
