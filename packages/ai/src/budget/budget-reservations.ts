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

// Durable per-turn budget reservations (`ai_budget_reservations`).
//
// A reservation and its daily-counter increment are committed in one
// transaction, and terminal transitions lock the ledger row `FOR UPDATE`, so
// duplicate callbacks cannot apply a delta twice.

import { randomUUID } from 'node:crypto';

import { requireTenantIdForUser, type DbClient } from '@kestrel/db';
import { createCategorizedLogger } from '@kestrel/shared/logger';
import { sql } from 'drizzle-orm';

import { getDiagnosticContext } from '../diagnostics/run-context';
import { getDb } from '../runtime/db';
import { reservedSpendUsd, utcDayKey } from './budget-spend';
import { DEFAULT_MAX_DAILY_USD } from './pricing-catalog';

const log = createCategorizedLogger('ai', { component: 'cost' });

export interface BudgetReservation {
  ok: boolean;
  spent: number;
  max: number;
  /** Durable ledger row created with the atomic daily-counter reservation. */
  reservationId?: string;
}

interface BudgetCorrelation {
  threadId?: string;
  traceId?: string;
  runId?: string;
  jobId?: string;
}

type BudgetDb = Pick<DbClient, 'execute'>;

/**
 * Atomically reserve `estimatedUsd` against today's running counter for the
 * given user. Returns `{ ok: true }` iff the reservation fits under `capUsd`.
 */
export async function tryReserveBudget(
  userId: string,
  estimatedUsd: number,
  capUsd: number,
  now = new Date(),
  correlation?: BudgetCorrelation,
  db?: BudgetDb,
  tenantIdOverride?: string,
): Promise<BudgetReservation> {
  const day = utcDayKey(now);
  const tenantId = tenantIdOverride ?? (await requireTenantIdForUser(userId, getDb()));
  const activeDiagnostic = getDiagnosticContext();
  const ledgerCorrelation = correlation ?? activeDiagnostic ?? undefined;
  const estCents = Math.max(0, Math.ceil(estimatedUsd * 100));
  const capCents = Math.max(0, Math.ceil(capUsd * 100));

  // NaN guard — when `capUsd` is undefined/NaN (raw process.env bypassing the
  // Zod-parsed env), the second message's ON CONFLICT WHERE would bind NaN to
  // a bigint and PostgreSQL rejects it. Bail out deterministically.
  if (!Number.isFinite(estCents) || !Number.isFinite(capCents)) {
    log.warn('tryReserveBudget received non-finite value', { estCents, capCents, capUsd });
    const spent = await reservedSpendUsd(userId, now);
    return { ok: false, spent, max: DEFAULT_MAX_DAILY_USD };
  }

  if (estCents > capCents) {
    const spent = await reservedSpendUsd(userId, now);
    return { ok: false, spent, max: capUsd };
  }

  const reservationId = randomUUID();
  const ledgerThreadId =
    ledgerCorrelation?.threadId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      ledgerCorrelation.threadId,
    )
      ? ledgerCorrelation.threadId
      : null;
  const reserve = async (tx: BudgetDb) => {
    const rows = await tx.execute<{ total_usd_cents: number | string }>(
      sql`
        INSERT INTO daily_ai_spend (user_id, tenant_id, day, total_usd_cents)
        VALUES (${userId}, ${tenantId}, ${day}, ${estCents})
        ON CONFLICT (user_id, day) DO UPDATE
          SET total_usd_cents = daily_ai_spend.total_usd_cents + ${estCents}
          WHERE daily_ai_spend.total_usd_cents + ${estCents} <= ${capCents}
        RETURNING total_usd_cents
      `,
    );
    const list = (
      Array.isArray(rows) ? rows : ((rows as { rows?: unknown[] }).rows ?? [])
    ) as Array<{ total_usd_cents: number | string }>;
    const first = list[0];
    if (!first) return null;

    await tx.execute(
      sql`
        INSERT INTO ai_budget_reservations
          (id, user_id, tenant_id, thread_id, day, reserved_usd_cents, status, trace_id, run_id, job_id)
        VALUES (
          ${reservationId},
          ${userId},
          ${tenantId},
          ${ledgerThreadId},
          ${day},
          ${estCents},
          'reserved',
          ${ledgerCorrelation?.traceId ?? null},
          ${ledgerCorrelation?.runId ?? null},
          ${ledgerCorrelation?.jobId ?? null}
        )
      `,
    );
    return { totalCents: Number(first.total_usd_cents) };
  };
  const outcome = await (db ? reserve(db) : getDb().transaction((tx) => reserve(tx)));

  if (!outcome) {
    const spent = await reservedSpendUsd(userId, now);
    return { ok: false, spent, max: capUsd };
  }
  return {
    ok: true,
    spent: outcome.totalCents / 100,
    max: capUsd,
    reservationId,
  };
}

interface StoredReservation {
  user_id: string;
  tenant_id: string;
  day: string;
  reserved_usd_cents: number | string;
  status: string;
}

function resultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (typeof result === 'object' && result !== null && 'rows' in result) {
    const rows = (result as { rows?: unknown }).rows;
    return Array.isArray(rows) ? (rows as T[]) : [];
  }
  return [];
}

async function lockReservation(tx: BudgetDb, reservationId: string) {
  const reservations = resultRows<StoredReservation>(
    await tx.execute(
      sql`
        SELECT user_id, tenant_id, day, reserved_usd_cents, status
        FROM ai_budget_reservations
        WHERE id = ${reservationId}
        FOR UPDATE
      `,
    ),
  );
  return reservations[0] ?? null;
}

/**
 * Reconcile a durable reservation exactly once. The ledger row and daily
 * counter are locked in one transaction, so duplicate terminal callbacks
 * cannot apply the delta twice.
 */
export async function reconcileBudgetReservation(
  reservationId: string,
  actualUsd: number,
  now = new Date(),
): Promise<boolean> {
  if (!Number.isFinite(actualUsd)) throw new Error('actual budget cost must be finite');
  const actualCents = Math.max(0, Math.round(actualUsd * 100));
  // postgres-js rejects Date instances in this raw Drizzle SQL path.
  const resolvedAt = now.toISOString();
  return getDb().transaction(async (tx) => {
    const reservation = await lockReservation(tx, reservationId);
    if (!reservation || reservation.status !== 'reserved') return false;

    const deltaCents = actualCents - Number(reservation.reserved_usd_cents);
    if (deltaCents !== 0) {
      const counterRows = resultRows<{ user_id: string }>(
        await tx.execute(
          sql`
          UPDATE daily_ai_spend
          SET total_usd_cents = GREATEST(0, total_usd_cents + ${deltaCents})
          WHERE user_id = ${reservation.user_id}
            AND tenant_id = ${reservation.tenant_id}
            AND day = ${reservation.day}
          RETURNING user_id
        `,
        ),
      );
      if (counterRows.length === 0) throw new Error('daily budget counter missing for reservation');
    }

    await tx.execute(
      sql`
        UPDATE ai_budget_reservations
        SET actual_usd_cents = ${actualCents},
            status = 'reconciled',
            resolved_at = ${resolvedAt},
            last_error = NULL
        WHERE id = ${reservationId}
          AND user_id = ${reservation.user_id}
          AND tenant_id = ${reservation.tenant_id}
          AND status = 'reserved'
      `,
    );
    return true;
  });
}

/** Release a durable reservation exactly once after an interrupted run. */
export async function releaseBudgetReservation(
  reservationId: string,
  now = new Date(),
): Promise<boolean> {
  const resolvedAt = now.toISOString();
  return getDb().transaction(async (tx) => {
    const reservation = await lockReservation(tx, reservationId);
    if (!reservation || reservation.status !== 'reserved') return false;

    const counterRows = resultRows<{ user_id: string }>(
      await tx.execute(
        sql`
        UPDATE daily_ai_spend
        SET total_usd_cents = GREATEST(0, total_usd_cents - ${Number(reservation.reserved_usd_cents)})
        WHERE user_id = ${reservation.user_id}
          AND tenant_id = ${reservation.tenant_id}
          AND day = ${reservation.day}
        RETURNING user_id
      `,
      ),
    );
    if (counterRows.length === 0) throw new Error('daily budget counter missing for reservation');

    await tx.execute(
      sql`
        UPDATE ai_budget_reservations
        SET actual_usd_cents = 0,
            status = 'released',
            resolved_at = ${resolvedAt},
            last_error = NULL
        WHERE id = ${reservationId}
          AND user_id = ${reservation.user_id}
          AND tenant_id = ${reservation.tenant_id}
          AND status = 'reserved'
      `,
    );
    return true;
  });
}

/**
 * Recover reservations left open by a crashed or disconnected process.
 * Selection is bounded and terminal release is conditional, so concurrent
 * workers can safely run this job without double-decrementing the counter.
 */
export async function recoverStaleBudgetReservations(
  cutoff: Date,
  limit = 100,
  signal?: AbortSignal,
): Promise<{ scanned: number; released: number; failed: number }> {
  if (signal?.aborted) return { scanned: 0, released: 0, failed: 0 };
  const boundedLimit = Math.max(1, Math.min(500, Math.floor(limit)));
  const rows = resultRows<{ id: string }>(
    await getDb().execute(
      sql`
      SELECT r.id
      FROM ai_budget_reservations r
      WHERE r.status = 'reserved' AND r.created_at < ${cutoff.toISOString()}
        AND NOT EXISTS (
          SELECT 1
          FROM full_analysis_queue q
          WHERE q.run_id = r.run_id
            AND (
              q.status = 'pending'
              OR (q.status = 'running' AND q.lease_expires_at > now())
            )
        )
      ORDER BY r.created_at ASC
      LIMIT ${boundedLimit}
    `,
    ),
  );

  let released = 0;
  let failed = 0;
  for (const row of rows) {
    if (signal?.aborted) break;
    try {
      if (await releaseBudgetReservation(row.id)) released += 1;
    } catch (err) {
      failed += 1;
      log.error('stale budget reservation recovery failed', {
        reservationId: row.id,
        err: String(err),
      });
    }
  }
  return { scanned: rows.length, released, failed };
}
