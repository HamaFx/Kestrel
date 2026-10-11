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

// PF-05 — Budget guard extracted from agent.ts.
//
// @deprecated (audit plan §1.3): use `budget.ts` / `budget-reservation.ts`.
// Q4 decision: spend is ledger-only — reservations record cost for admin
// reporting but never block a turn unless ENFORCE_BUDGET=true. This module
// is kept for one release for external importers; its behavior now matches
// the facade.

import { metrics } from '@kestrel/shared';
import { createCategorizedLogger } from '@kestrel/shared/logger';

import { isBudgetEnforced, UNCAPPED_DAILY_USD } from './budget';
import {
  applyBudgetDelta,
  BudgetExceededError,
  DEFAULT_MAX_DAILY_USD,
  DEFAULT_TURN_ESTIMATE_USD,
  releaseBudgetReservation,
  tryReserveBudget,
} from './cost';

export { BudgetExceededError };

const blog = createCategorizedLogger('ai', { component: 'budget-guard' });

/** Result of reserving budget for a turn. */
export interface BudgetReservation {
  /** Whether the reservation was accepted. */
  ok: boolean;
  /** Current spend at reservation time. */
  spent: number;
  /** Daily cap at reservation time. */
  max: number;
  /** The estimated USD reserved for this turn. */
  reservedUsd: number;
  /** Durable reservation ledger ID when the database supports recovery. */
  reservationId?: string;
  /** Whether the budget has been released (for idempotent release). */
  released: boolean;
}

/**
 * @deprecated Use `reserveTurnBudget` from `budget-reservation.ts`.
 * Reserve budget for a chat turn. Q4: ledger-only unless ENFORCE_BUDGET=true;
 * throws BudgetExceededError only under explicit enforcement.
 */
export async function reserveBudget(
  userId: string,
  maxDailyUsd: number,
): Promise<BudgetReservation> {
  const capUsd = isBudgetEnforced() ? (maxDailyUsd ?? DEFAULT_MAX_DAILY_USD) : UNCAPPED_DAILY_USD;
  const reservation = await tryReserveBudget(userId, DEFAULT_TURN_ESTIMATE_USD, capUsd);
  if (!reservation.ok) {
    throw new BudgetExceededError(reservation.spent, reservation.max);
  }
  return {
    ok: true,
    spent: reservation.spent,
    max: reservation.max,
    reservedUsd: DEFAULT_TURN_ESTIMATE_USD,
    ...(reservation.reservationId ? { reservationId: reservation.reservationId } : {}),
    released: false,
  };
}

/**
 * Reconcile the budget reservation with the actual cost after the turn
 * completes. Positive delta = we underestimated; negative = release excess.
 */
export async function reconcileBudget(
  userId: string,
  actualCostUsd: number,
  reservedUsd: number,
): Promise<void> {
  const delta = actualCostUsd - reservedUsd;
  if (Math.abs(delta) < 0.0001) return; // No meaningful difference
  await applyBudgetDelta(userId, delta).catch((err) => {
    blog.error('budget reconciliation failed', {
      userId,
      actualCostUsd,
      reservedUsd,
      delta,
      err: String(err),
    });
  });
}

/**
 * Release an unused budget reservation (e.g., on non-retryable error or
 * client disconnect). Idempotent — safe to call multiple times.
 */
export async function releaseBudget(reservation: BudgetReservation, userId: string): Promise<void> {
  if (reservation.released) return;
  try {
    if (reservation.reservationId) {
      await releaseBudgetReservation(reservation.reservationId);
    } else {
      await applyBudgetDelta(userId, -reservation.reservedUsd);
    }
    (reservation as { released: boolean }).released = true;
  } catch (err) {
    // Keep the reservation open when the sink fails so a later terminal
    // recovery path can retry without losing the correction.
    metrics.increment('budget_stranded_total');
    blog.error('budget release failed; reservation remains open', {
      userId,
      reservedUsd: reservation.reservedUsd,
      err: String(err),
    });
  }
}
