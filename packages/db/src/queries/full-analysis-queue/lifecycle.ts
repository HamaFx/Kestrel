/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

// Lease-owned lifecycle transitions: heartbeat, progress, complete, fail,
// requeue. Every write is guarded by (run id, worker run id, status, lease)
// so a worker can never mutate a row it no longer owns.

import { metrics } from '@kestrel/shared';
import { and, eq, gt, sql } from 'drizzle-orm';

import { getDb, schema } from '../../client';
import type {
  FullAnalysisQueueRow,
  FullAnalysisQueueStatus,
} from '../../schema/ai/full-analysis-queue';
import { FullAnalysisQueueCancelledError, FullAnalysisQueueOwnershipError } from './errors';
import type { FullAnalysisLeaseInput, FullAnalysisLedgerSnapshotPayload } from './types';

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
    const existing = await db
      .select({ status: schema.fullAnalysisQueue.status })
      .from(schema.fullAnalysisQueue)
      .where(eq(schema.fullAnalysisQueue.runId, input.runId))
      .limit(1);
    if (existing[0]?.status === 'cancelled') {
      throw new FullAnalysisQueueCancelledError();
    }
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
  if (!row) {
    // A progress write can race the user's cancellation: the queue row is no
    // longer `running`, so the ownership predicate matches nothing. Mirror the
    // heartbeat classification here so the worker treats that race as a
    // cancellation (interrupted notice + cancel settlement) instead of a lost
    // lease. Genuine lease loss still throws the ownership error.
    const existing = await db
      .select({ status: schema.fullAnalysisQueue.status })
      .from(schema.fullAnalysisQueue)
      .where(eq(schema.fullAnalysisQueue.runId, input.runId))
      .limit(1);
    if (existing[0]?.status === 'cancelled') {
      throw new FullAnalysisQueueCancelledError();
    }
    throw new FullAnalysisQueueOwnershipError();
  }
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
