/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import type { DbClient } from '@kestrel/db';
import { metrics } from '@kestrel/shared';
import { createCategorizedLogger } from '@kestrel/shared/logger';

import { acquireBudget } from './budget';
import {
  applyBudgetDelta,
  BudgetExceededError,
  DEFAULT_TURN_ESTIMATE_USD,
  reconcileBudgetReservation,
  releaseBudgetReservation,
  type BudgetReservation,
} from './cost';

const alog = createCategorizedLogger('ai', { component: 'budget' });

type BudgetDb = Pick<DbClient, 'execute'>;

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
