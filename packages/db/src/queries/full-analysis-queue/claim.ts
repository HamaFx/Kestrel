/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

// Atomic claim of one pending Full-analysis row (skip-locked, lease-taking).

import { metrics } from '@kestrel/shared';
import { and, asc, eq, isNull, lte, or, sql } from 'drizzle-orm';

import { getDb, schema, type DbClient } from '../../client';
import type { FullAnalysisQueueRow } from '../../schema/ai/full-analysis-queue';
import type { ClaimFullAnalysisQueueOptions } from './types';

/**
 * `db.execute` bypasses Drizzle's row mapper: raw driver rows arrive with
 * snake_case keys and unparsed timestamp strings. The atomic claim therefore
 * returns only the claimed run id and re-reads the row through the typed
 * query builder, guaranteeing a real `FullAnalysisQueueRow` (Date instances,
 * JSON columns and JS-key names) for callers.
 */
async function readClaimedRow(db: DbClient, runId: string): Promise<FullAnalysisQueueRow | null> {
  const rows = await db
    .select()
    .from(schema.fullAnalysisQueue)
    .where(eq(schema.fullAnalysisQueue.runId, runId))
    .limit(1);
  return rows[0] ?? null;
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
  // locked row in the same statement so no JS-side retry loop is needed. The
  // raw driver result is used only for the claimed id; the row is then
  // re-read through the typed builder so timestamps/JSON are parsed.
  if (!options.ownsTenant) {
    const rows = await db.execute<{ run_id: string }>(sql`
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
      RETURNING q.run_id
    `);
    const claimedRunId = (rows as unknown as Array<{ run_id?: string }>)[0]?.run_id;
    if (!claimedRunId) return null;
    return readClaimedRow(db, claimedRunId);
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
