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

// SPDX-License-Identifier: Apache-2.0

/**
 * Budget facade (audit plan §1.3 Q4 decision, §4.3 module collapse).
 *
 * The daily budget is **observability only**: every reservation is still
 * atomically ledgered (`daily_ai_spend` + `ai_budget_reservations`) for admin
 * reporting and billing, but no turn is ever rejected with 429 by default.
 * Set `ENFORCE_BUDGET=true` to restore the legacy hard cap.
 *
 * §4.3: this module is the single budget facade. `acquireBudget` /
 * `reserveTurnBudget` are the entry points every turn path goes through
 * (`budget-reservation.ts` and `budget-guard.ts` were folded in / deleted);
 * neither throws `BudgetExceededError` while enforcement is off. The
 * ledger/rate table lives in `cost.ts`.
 */

import { metrics, readFeatureFlag } from '@kestrel/shared';
import { createCategorizedLogger } from '@kestrel/shared/logger';

import {
  applyBudgetDelta,
  BudgetExceededError,
  DEFAULT_TURN_ESTIMATE_USD,
  reconcileBudgetReservation,
  releaseBudgetReservation,
  tryReserveBudget,
  type BudgetReservation,
} from './cost';

const alog = createCategorizedLogger('ai', { component: 'budget' });

/**
 * Effective "no cap" value used while enforcement is off. One million USD a
 * day keeps the SQL ceiling a sane bigint while being unreachable in practice.
 */
export const UNCAPPED_DAILY_USD = 1_000_000;

/**
 * Q4: budget enforcement is off by default; spend is ledgered, never blocking.
 * Audit v2 P2-14 — read fresh on every call (the flag parser is a documented
 * cheap raw read) so runtime env flips apply without a process restart.
 */
export function isBudgetEnforced(): boolean {
  return readFeatureFlag('ENFORCE_BUDGET');
}

/** No-op retained for test compatibility — enforcement is no longer memoized. */
export function _resetBudgetEnforcementCache(): void {
  /* intentionally empty (P2-14: the memo was removed) */
}

/** Resolve the cap actually used for the atomic reservation. */
export function effectiveDailyCap(maxDailyUsd: number): number {
  return isBudgetEnforced() ? maxDailyUsd : UNCAPPED_DAILY_USD;
}

export interface AcquireBudgetArgs {
  userId: string;
  /** Estimated turn cost; defaults to the standard turn estimate. */
  estimateUsd?: number;
  /** Admin-configured daily ceiling — enforced only when ENFORCE_BUDGET=true. */
  maxDailyUsd: number;
  correlation?: {
    threadId?: string;
    traceId?: string;
    runId?: string;
    jobId?: string;
  };
  tenantId?: string;
  db?: Parameters<typeof tryReserveBudget>[5];
}

export interface AcquireBudgetResult {
  reservation: BudgetReservation;
  /** The cap the reservation was actually checked against. */
  effectiveCap: number;
}

/**
 * Acquire the turn's ledger reservation. Never throws `BudgetExceededError`
 * while enforcement is off (Q4); under enforcement the caller receives
 * `{ ok: false }` and decides how to surface the cap.
 */
export async function acquireBudget(args: AcquireBudgetArgs): Promise<AcquireBudgetResult> {
  const estimateUsd = args.estimateUsd ?? DEFAULT_TURN_ESTIMATE_USD;
  const effectiveCap = effectiveDailyCap(args.maxDailyUsd);
  const reservation = await tryReserveBudget(
    args.userId,
    estimateUsd,
    effectiveCap,
    new Date(),
    args.correlation,
    args.db,
    args.tenantId,
  );
  return { reservation, effectiveCap };
}

// ---------------------------------------------------------------------------
// Turn reservation handles (folded in from `budget-reservation.ts`, §4.3 —
// exported names are unchanged so callers did not need to change).
// ---------------------------------------------------------------------------

/** Minimal database surface the reservation paths use. */
type BudgetDb = NonNullable<Parameters<typeof tryReserveBudget>[5]>;

export interface BudgetHandle {
  reservedUsd: number;
  /** Durable ledger identifier for this reservation, when available. */
  reservationId?: string;
  spent: number;
  max: number;
  released: boolean;
  reconcile(observedUsd: number): Promise<void>;
  release(): Promise<void>;
}

export async function reserveTurnBudget(args: {
  userId: string;
  estimateUsd?: number;
  maxDailyUsd: number;
  tenantId?: string;
  correlation?: {
    threadId?: string;
    traceId?: string;
    runId?: string;
    jobId?: string;
  };
  db?: BudgetDb;
}): Promise<BudgetHandle> {
  // Audit plan §1.3 (Q4): ledger-only by default. The reservation always
  // records spend; a cap rejection is possible only under ENFORCE_BUDGET.
  const { reservation } = await acquireBudget({
    userId: args.userId,
    ...(args.estimateUsd !== undefined ? { estimateUsd: args.estimateUsd } : {}),
    maxDailyUsd: args.maxDailyUsd,
    ...(args.correlation ? { correlation: args.correlation } : {}),
    ...(args.tenantId ? { tenantId: args.tenantId } : {}),
    ...(args.db ? { db: args.db } : {}),
  });
  if (!reservation.ok) {
    // Reachable only when ENFORCE_BUDGET=true (legacy hard cap).
    throw new BudgetExceededError(reservation.spent, reservation.max);
  }

  metrics.increment('budget_reserved_total');
  return createBudgetHandle({
    userId: args.userId,
    estimateUsd: args.estimateUsd ?? DEFAULT_TURN_ESTIMATE_USD,
    reservation,
  });
}

/** Adopt a reservation created by atomic durable queue admission. */
export function resumeTurnBudget(args: {
  userId: string;
  reservationId: string;
  estimateUsd: number;
  maxDailyUsd: number;
  spent?: number;
}): BudgetHandle {
  return createBudgetHandle({
    userId: args.userId,
    estimateUsd: args.estimateUsd,
    reservation: {
      ok: true,
      spent: args.spent ?? 0,
      max: args.maxDailyUsd,
      reservationId: args.reservationId,
    },
  });
}

function createBudgetHandle(args: {
  userId: string;
  estimateUsd: number;
  reservation: BudgetReservation;
}): BudgetHandle {
  const state = { released: false };
  return {
    reservedUsd: args.estimateUsd,
    ...(args.reservation.reservationId ? { reservationId: args.reservation.reservationId } : {}),
    spent: args.reservation.spent,
    max: args.reservation.max,
    get released() {
      return state.released;
    },
    async reconcile(observedUsd: number) {
      if (state.released) return;
      if (!Number.isFinite(observedUsd) || observedUsd < 0) {
        alog.error('invalid observed cost; reservation remains open', {
          userId: args.userId,
          observedUsd,
        });
        return;
      }
      const delta = observedUsd - args.estimateUsd;
      try {
        if (args.reservation.reservationId) {
          await reconcileBudgetReservation(args.reservation.reservationId, observedUsd);
        } else {
          await applyBudgetDelta(args.userId, delta);
        }
        state.released = true;
      } catch (err) {
        alog.error('budget reconciliation failed; reservation remains open', {
          userId: args.userId,
          delta,
          err: String(err),
        });
      }
    },
    async release() {
      if (state.released) return;
      try {
        if (args.reservation.reservationId) {
          await releaseBudgetReservation(args.reservation.reservationId);
        } else {
          await applyBudgetDelta(args.userId, -args.estimateUsd);
        }
        state.released = true;
      } catch (err) {
        metrics.increment('budget_release_failed_total');
        alog.error('budget release failed; reservation remains open', {
          userId: args.userId,
          reservedUsd: args.estimateUsd,
          err: String(err),
        });
      }
    },
  };
}
