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

// Phase 5 — outbox scanning and status transitions (DEC-05 split of
// recovery.ts). One claim per iteration, bounded backoff, fail-closed
// payload errors.

import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';

import { getDb } from '../../runtime/db';

const LOCK_TTL_MS = 5 * 60 * 1000;
const MAX_BACKOFF_MS = 60 * 60 * 1000;

export interface ClaimedFailure {
  id: string;
  operation: string;
  payload: Record<string, unknown>;
  attemptCount: number;
  maxAttempts: number;
  lockToken: string;
}

export function resultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (typeof result === 'object' && result !== null && 'rows' in result) {
    const rows = (result as { rows?: unknown }).rows;
    return Array.isArray(rows) ? (rows as T[]) : [];
  }
  return [];
}

export async function claimOne(): Promise<ClaimedFailure | null> {
  const lockToken = randomUUID();
  // ISO strings, not Date objects: drizzle's raw `sql` templates do not map
  // parameters, and the postgres-js driver hashes them — a Date instance
  // crashes the query with ERR_INVALID_ARG_TYPE before it reaches Postgres
  // (this silently broke every outbox replay until 2026-10-27).
  const lockedUntil = new Date(Date.now() + LOCK_TTL_MS).toISOString();
  return getDb().transaction(async (tx) => {
    const rows = resultRows<{
      id: string;
      operation: string;
      payload: Record<string, unknown>;
      attempt_count: number | string;
      max_attempts: number | string;
    }>(
      await tx.execute(sql`
      SELECT id, operation, payload, attempt_count, max_attempts
      FROM persistence_outbox
      WHERE (
          status IN ('pending', 'failed')
          OR (status = 'processing' AND locked_until < now())
        )
        AND next_attempt_at <= now()
        AND attempt_count < max_attempts
        AND (locked_until IS NULL OR locked_until < now())
      ORDER BY next_attempt_at ASC, created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `),
    );
    const row = rows[0];
    if (!row) return null;

    const nextAttempt = Number(row.attempt_count) + 1;
    const updated = resultRows<{ id: string }>(
      await tx.execute(sql`
      UPDATE persistence_outbox
      SET status = 'processing',
          attempt_count = ${nextAttempt},
          locked_until = ${lockedUntil},
          lock_token = ${lockToken},
          updated_at = now()
      WHERE id = ${row.id}
        AND (
          status IN ('pending', 'failed')
          OR (status = 'processing' AND locked_until < now())
        )
      RETURNING id
    `),
    );
    if (updated.length === 0) return null;

    return {
      id: row.id,
      operation: row.operation,
      payload: row.payload,
      attemptCount: nextAttempt,
      maxAttempts: Number(row.max_attempts),
      lockToken,
    };
  });
}

export async function markCompleted(item: ClaimedFailure): Promise<void> {
  await getDb().execute(sql`
    UPDATE persistence_outbox
    SET status = 'completed',
        locked_until = NULL,
        lock_token = NULL,
        last_error = NULL,
        completed_at = now(),
        updated_at = now()
    WHERE id = ${item.id} AND status = 'processing' AND lock_token = ${item.lockToken}
  `);
}

export async function markFailed(item: ClaimedFailure, error: unknown): Promise<void> {
  const invalidPayload = error instanceof Error && error.message.startsWith('Invalid ');
  const delayMs = Math.min(MAX_BACKOFF_MS, 1_000 * 2 ** Math.min(item.attemptCount - 1, 10));
  // ISO string for the same reason as claimOne's lockedUntil above.
  const nextAttemptAt = new Date(Date.now() + delayMs).toISOString();
  const message = error instanceof Error ? error.message : String(error);
  // Payload/schema failures are permanent and should not burn all retry
  // attempts or keep resurfacing as noisy transient failures.
  const nextStatus = invalidPayload || item.attemptCount >= item.maxAttempts ? 'dead' : 'failed';
  await getDb().execute(sql`
    UPDATE persistence_outbox
    SET status = ${nextStatus},
        locked_until = NULL,
        lock_token = NULL,
        last_error = ${message.slice(0, 2_000)},
        next_attempt_at = ${nextAttemptAt},
        updated_at = now()
    WHERE id = ${item.id} AND status = 'processing' AND lock_token = ${item.lockToken}
  `);
}
