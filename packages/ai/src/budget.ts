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
 * Budget facade (audit plan §1.3, Q4 decision).
 *
 * The daily budget is **observability only**: every reservation is still
 * atomically ledgered (`daily_ai_spend` + `ai_budget_reservations`) for admin
 * reporting and billing, but no turn is ever rejected with 429 by default.
 * Set `ENFORCE_BUDGET=true` to restore the legacy hard cap.
 *
 * `acquireBudget` is the single entry point every turn path goes through
 * (`budget-reservation.ts` delegates here); it never throws
 * `BudgetExceededError` while enforcement is off.
 */

import { readFeatureFlag } from '@kestrel/shared';

import { DEFAULT_TURN_ESTIMATE_USD, tryReserveBudget, type BudgetReservation } from './cost';

/**
 * Effective "no cap" value used while enforcement is off. One million USD a
 * day keeps the SQL ceiling a sane bigint while being unreachable in practice.
 */
export const UNCAPPED_DAILY_USD = 1_000_000;

let enforcedCache: boolean | undefined;

/** Q4: budget enforcement is off by default; spend is ledgered, never blocking. */
export function isBudgetEnforced(): boolean {
  if (enforcedCache === undefined) {
    enforcedCache = readFeatureFlag('ENFORCE_BUDGET');
  }
  return enforcedCache;
}

/** Test helper — reset the memoized enforcement flag after mutating env. */
export function _resetBudgetEnforcementCache(): void {
  enforcedCache = undefined;
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
