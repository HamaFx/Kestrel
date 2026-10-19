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

import {
  isCreditsEnforcementEnabled,
  isCreditsShadowLogEnabled,
  reconcileCreditReservation,
  releaseCreditReservation,
  reserveCredits,
} from '@kestrel/db';
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
import {
  estimateCreditsForTurn,
  platformFeeCredits,
  usdToCredits,
  type CreditTurnMode,
  type ProviderMode,
} from './credits';

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

export interface CreditReservationOptions {
  /** Qualified model id used for the pre-flight estimate and actual cost. */
  modelId?: string | null;
  providerMode: ProviderMode;
  mode: CreditTurnMode;
  /** Stable chat-turn/job key; replays must reuse it. */
  idempotencyKey: string;
  threadId?: string;
  traceId?: string;
  runId?: string;
  jobId?: string;
}

/** Admission failure when CREDITS_ENFORCEMENT_ENABLED=1 and the wallet is short. */
export class InsufficientCreditsError extends Error {
  readonly code = 'INSUFFICIENT_CREDITS' as const;
  readonly balance: number;
  readonly required: number;

  constructor(balance: number, required: number) {
    super(`Insufficient credits: balance ${balance}, required ${required}`);
    this.name = 'InsufficientCreditsError';
    this.balance = balance;
    this.required = required;
  }
}

export interface CreditHandle {
  reservationId: string;
  reservedCredits: number;
  providerMode: ProviderMode;
  reconcile(actualCredits: number): Promise<void>;
  release(): Promise<void>;
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
  /** Optional credit pre-authorisation performed alongside the USD ledger. */
  credit?: CreditReservationOptions;
  /** Adopt an existing credit reservation (durable worker resume). */
  creditReservationId?: string;
  reservedCredits?: number;
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
  /** Present when a credit reservation was created for this turn. */
  credit?: CreditHandle;
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
  credit?: CreditReservationOptions;
  creditReservationId?: string;
  reservedCredits?: number;
}): Promise<BudgetHandle> {
  // Credit admission runs first: it is the authoritative gate. When
  // enforcement is off, a short balance is logged and the turn continues
  // (shadow metering, plan Phase 3).
  let credit: CreditHandle | null = null;
  if (args.creditReservationId) {
    credit = createCreditHandle({
      userId: args.userId,
      reservationId: args.creditReservationId,
      reservedCredits: args.reservedCredits ?? estimateCreditsForTurn({
        mode: args.credit?.mode ?? 'single',
        providerMode: args.credit?.providerMode ?? 'managed',
        modelId: args.credit?.modelId ?? null,
      }),
      providerMode: args.credit?.providerMode ?? 'managed',
    });
  } else if (args.credit) {
    const estimate = estimateCreditsForTurn({
      mode: args.credit.mode,
      providerMode: args.credit.providerMode,
      modelId: args.credit.modelId ?? null,
    });
    const enforced = isCreditsEnforcementEnabled();
    const shouldWrite = enforced || isCreditsShadowLogEnabled();
    if (shouldWrite && estimate > 0) {
      const reserved = await reserveCredits({
        userId: args.userId,
        estimateCredits: estimate,
        idempotencyKey: args.credit.idempotencyKey,
        // Phase 3: while enforcement is off, record without debiting.
        shadow: !enforced,
        ...(args.credit.threadId ? { threadId: args.credit.threadId } : {}),
        ...(args.credit.traceId ? { traceId: args.credit.traceId } : {}),
        ...(args.credit.runId ? { runId: args.credit.runId } : {}),
        ...(args.credit.jobId ? { jobId: args.credit.jobId } : {}),
        ...(args.tenantId ? { tenantId: args.tenantId } : {}),
        ...(args.db ? { db: args.db } : {}),
      });
      if (!reserved.ok) {
        metrics.increment('credits_rejected_insufficient_total');
        if (enforced) throw new InsufficientCreditsError(reserved.balanceAfter, reserved.required);
        alog.info('credit shadow reservation skipped (insufficient balance)', {
          userId: args.userId,
          balance: reserved.balanceAfter,
          required: reserved.required,
          mode: args.credit.mode,
        });
      } else if (reserved.reservationId) {
        credit = createCreditHandle({
          userId: args.userId,
          reservationId: reserved.reservationId,
          reservedCredits: reserved.required,
          providerMode: args.credit.providerMode,
        });
      }
    }
  }

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
    // Budget admission lost after credits reserved — release before throwing.
    // Inside a caller-owned transaction the outer rollback already undoes the
    // debit, so a separate release would double-credit.
    if (credit && !args.db) await credit.release().catch(() => undefined);
    // Reachable only when ENFORCE_BUDGET=true (legacy hard cap).
    throw new BudgetExceededError(reservation.spent, reservation.max);
  }

  metrics.increment('budget_reserved_total');
  return createBudgetHandle({
    userId: args.userId,
    estimateUsd: args.estimateUsd ?? DEFAULT_TURN_ESTIMATE_USD,
    reservation,
    ...(credit ? { credit } : {}),
  });
}

/** Adopt a reservation created by atomic durable queue admission. */
export function resumeTurnBudget(args: {
  userId: string;
  reservationId: string;
  estimateUsd: number;
  maxDailyUsd: number;
  spent?: number;
  creditReservationId?: string;
  reservedCredits?: number;
  credit?: CreditReservationOptions;
}): BudgetHandle {
  const credit = args.creditReservationId
    ? createCreditHandle({
        userId: args.userId,
        reservationId: args.creditReservationId,
        reservedCredits: args.reservedCredits ??
          estimateCreditsForTurn({
            mode: args.credit?.mode ?? 'full',
            providerMode: args.credit?.providerMode ?? 'managed',
            modelId: args.credit?.modelId ?? null,
          }),
        providerMode: args.credit?.providerMode ?? 'managed',
      })
    : undefined;
  return createBudgetHandle({
    userId: args.userId,
    estimateUsd: args.estimateUsd,
    reservation: {
      ok: true,
      spent: args.spent ?? 0,
      max: args.maxDailyUsd,
      reservationId: args.reservationId,
    },
    ...(credit ? { credit } : {}),
  });
}

function createCreditHandle(args: {
  userId: string;
  reservationId: string;
  reservedCredits: number;
  providerMode: ProviderMode;
}): CreditHandle {
  let settled = false;
  return {
    reservationId: args.reservationId,
    reservedCredits: args.reservedCredits,
    providerMode: args.providerMode,
    async reconcile(actualCredits: number) {
      if (settled) return;
      const actual = Math.max(0, Math.ceil(actualCredits));
      try {
        const result = await reconcileCreditReservation({
          reservationId: args.reservationId,
          actualCredits: actual,
        });
        settled = result.reconciled;
        metrics.increment('credits_consumed_total');
        if (result.shortfallCredits > 0) {
          alog.warn('credit reservation short-charged', {
            userId: args.userId,
            reservationId: args.reservationId,
            shortfall: result.shortfallCredits,
          });
        }
      } catch (err) {
        alog.error('credit reconciliation failed; reservation remains open', {
          userId: args.userId,
          reservationId: args.reservationId,
          err: String(err),
        });
      }
    },
    async release() {
      if (settled) return;
      try {
        settled = await releaseCreditReservation({ reservationId: args.reservationId });
      } catch (err) {
        alog.error('credit release failed; reservation remains open', {
          userId: args.userId,
          reservationId: args.reservationId,
          err: String(err),
        });
      }
    },
  };
}

function createBudgetHandle(args: {
  userId: string;
  estimateUsd: number;
  reservation: BudgetReservation;
  credit?: CreditHandle;
}): BudgetHandle {
  const state = { released: false };
  return {
    reservedUsd: args.estimateUsd,
    ...(args.reservation.reservationId ? { reservationId: args.reservation.reservationId } : {}),
    ...(args.credit ? { credit: args.credit } : {}),
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
        if (args.credit) {
          await args.credit.reconcile(
            args.credit.providerMode === 'byok'
              ? platformFeeCredits()
              : usdToCredits(observedUsd),
          );
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
        if (args.credit) await args.credit.release();
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
