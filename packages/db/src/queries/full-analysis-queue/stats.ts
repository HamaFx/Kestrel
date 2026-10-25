/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

// Queue health aggregate (bounded; safe for `/api/health`).

import { sql } from 'drizzle-orm';

import { getDb, type DbClient } from '../../client';
import type { FullAnalysisQueueStats } from './types';

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
