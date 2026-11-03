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

// Alert evaluator orchestrator (DEC-05 split from evaluator.ts) — what the
// cron handler calls.
//
// Semantics:
//   - priceCross / candleClose — LEVEL alerts (one-shot). Fire the moment the
//     latest reading meets the rule, then deactivate.
//   - indicatorCross — true CROSSING semantics. We need the previous-tick
//     reading to detect a transition through the level; that baseline lives
//     on the rule itself (`rule.previousValue`). On the first tick it is
//     null and the alert never fires immediately on creation, even when
//     the indicator already sits past the threshold.
//
// In both flavours, delivery owns the `markFired` write; the alert stays
// active until a channel returns 2xx so transient delivery errors retry on
// the next cron tick.
//
// R10 (audit 2026-10-31) — one tick used to evaluate every active alert with no
// bound, deliver them strictly one at a time, and ignore the job's abort
// signal, so a single slow provider stalled every other user's alerts past the
// 120s job budget while its claim stayed held for the 30-minute lease. Now
// `listEvaluable` returns a bounded, rotating batch (see persistence/crud), the
// batch is served round-robin by user (`interleaveByUser`), the run / each
// alert / each channel attempt carry a time budget and the job's abort signal,
// and any claim still held when the run ends is released — a timeout is never
// a silent skip.

import { createCategorizedLogger } from '@kestrel/shared/logger';

import { getDb } from '../../runtime/db';
import { combineRunSignal } from '../../utils/timeout';
import {
  ALERT_DELIVERY_BUDGET_MS,
  budgetSignal,
  deliverAlert,
  isDeliveryAbandoned,
  raceWithAbort,
  type DeliveryResult,
} from '../delivery';
import {
  claimAlertDelivery,
  listEvaluable,
  releaseAlertDeliveryClaim,
  setRulePreviousValue,
} from '../persistence';
import { specFromRule } from '../spec';
import { DeliveryClaimLedger, type PendingDeliveryClaim } from './claims';
import type { EvaluatorEnv } from './env';
import { interleaveByUser, type EvaluationStopReason } from './fan-out';
import { readReadingsBatch } from './readings';
import { resolveAlertRunEnvs } from './user-env';

const elog = createCategorizedLogger('ai', { component: 'alerts-evaluator' });

/**
 * Default wall-clock budget for one run. The worker passes its own (below its
 * job timeout); the web cron route caps the function at 60s, so the default
 * stops claiming new work before either limit can kill the run.
 */
const DEFAULT_EVALUATION_BUDGET_MS = 60_000;

export interface EvaluationResult {
  total: number;
  matched: number;
  fired: number;
  skipped: number;
  errors: Array<{ alertId: string; message: string }>;
  deliveries: DeliveryResult[];
  /** `budget` or `aborted` mean work remains for the next tick. */
  stopReason: EvaluationStopReason;
  /** Delivery claims handed back to the queue when the run ended. */
  claimsReleased: number;
}

interface EvaluationOptions {
  env?: EvaluatorEnv;
  signal?: AbortSignal;
  ownsTenant?: (userId: string) => boolean;
  /** Max alerts to consider in this run (default `EVALUATION_BATCH_LIMIT`). */
  limit?: number;
  /** Rotation seed for the bounded window; defaults to one seed per minute. */
  rotationSeed?: number;
  /** Wall-clock budget for the whole run. */
  budgetMs?: number;
  /** Wall-clock budget for delivering one alert across its channels. */
  alertDeliveryBudgetMs?: number;
}

export async function evaluateAlerts(opts: EvaluationOptions = {}): Promise<EvaluationResult> {
  const allAlerts = await listEvaluable({
    ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
    ...(opts.rotationSeed !== undefined ? { rotationSeed: opts.rotationSeed } : {}),
  });
  const alerts = opts.ownsTenant ? allAlerts.filter((a) => opts.ownsTenant!(a.userId)) : allAlerts;

  // The run's own deadline: whichever of the job abort and the budget fires
  // first cancels in-flight providers, so the tick returns instead of being
  // killed with its claims still held.
  const budgetMs = Math.max(1, opts.budgetMs ?? DEFAULT_EVALUATION_BUDGET_MS);
  const deadlineAt = Date.now() + budgetMs;
  const runSignal = combineRunSignal({
    ...(opts.signal ? { userSignal: opts.signal } : {}),
    deadlineSignal: AbortSignal.timeout(budgetMs),
  });
  const alertBudgetMs = Math.max(1, opts.alertDeliveryBudgetMs ?? ALERT_DELIVERY_BUDGET_MS);

  const db = getDb();
  const { envFor, tenantFor } = await resolveAlertRunEnvs(alerts, db, opts.env);

  let matched = 0;
  let fired = 0;
  let skipped = 0;
  let claimsReleased: number;
  let stopReason: EvaluationStopReason = 'complete';
  const errors: EvaluationResult['errors'] = [];
  const deliveries: DeliveryResult[] = [];
  const claims = new DeliveryClaimLedger();

  // Phase 2 hardening §9 — read all rules' inputs in parallel.
  // We group dependencies (symbol, tf) and pre-fetch them concurrently
  // so we never execute duplicated upstream calls in this worker boundary.
  const batchMap = await readReadingsBatch(alerts);

  // R10 — a bounded batch + round-robin per user: one user's storm must not
  // push another user's alerts to the back of the queue.
  const readings = interleaveByUser(alerts).map((alert) => {
    const res = batchMap.get(alert.id);
    if (res instanceof Error) {
      return { alert, reading: null, error: res };
    }
    return { alert, reading: res ?? null, error: null };
  });

  try {
    for (const { alert, reading, error } of readings) {
      if (runSignal?.aborted) {
        stopReason = opts.signal?.aborted ? 'aborted' : 'budget';
        break;
      }
      if (Date.now() >= deadlineAt) {
        stopReason = 'budget';
        break;
      }
      if (error) {
        errors.push({
          alertId: alert.id,
          message: error.message,
        });
        continue;
      }
      try {
        if (!reading) {
          skipped += 1;
          continue;
        }

        // indicatorCross uses true crossing semantics: compare the previous
        // baseline (persisted on the rule) against the current value, seeding
        // it on the first tick. PF-08 — specification pattern for the rule.
        const spec = specFromRule(alert.rule);
        const cross =
          alert.rule.type === 'indicatorCross'
            ? { previousValue: alert.rule.previousValue ?? null }
            : undefined;
        const isMatch = spec.isSatisfiedBy(reading, cross);

        if (alert.rule.type === 'indicatorCross' && !isMatch) {
          // Seed / refresh the baseline so the next tick has the right
          // anchor. Best-effort: failures here just mean the next tick
          // re-seeds.
          try {
            await setRulePreviousValue(
              alert.userId,
              alert.id,
              alert.rule,
              reading.value,
              await tenantFor(alert.userId),
            );
          } catch (err) {
            elog.warn('setRulePreviousValue failed', { id: alert.id, err: String(err) });
          }
          continue;
        }

        if (!isMatch) continue;

        matched += 1;

        // Claim immediately before external delivery. The conditional UPDATE
        // is the concurrency boundary: only one cron runner can hold the
        // lease for an alert at a time. A failed delivery releases it; a
        // crashed runner leaves a lease that a later tick can reclaim.
        const claimAt = new Date();
        const claimed = await claimAlertDelivery(
          alert.userId,
          alert.id,
          claimAt,
          undefined,
          await tenantFor(alert.userId),
        );
        if (!claimed) {
          skipped += 1;
          continue;
        }

        const claim: PendingDeliveryClaim = { userId: alert.userId, alertId: alert.id, claimAt };
        claims.add(claim);
        // A claim is only settled once its outcome is terminal: delivered
        // (markFired cleared it) or successfully released. A failed release
        // stays in the ledger and the run-end sweep retries it.
        const releaseClaim = async (): Promise<void> => {
          try {
            await releaseAlertDeliveryClaim(claim.userId, claim.alertId, claim.claimAt);
            claims.settle(claim);
          } catch (releaseErr) {
            elog.warn('releaseAlertDeliveryClaim failed', {
              id: claim.alertId,
              err: String(releaseErr),
            });
          }
        };
        const alertEnv = envFor(alert.userId);
        // R10 — bound this alert, and combine with the run's abort signal.
        const remaining = Math.max(1, deadlineAt - Date.now());
        const deliveryBudgetMs = Math.min(alertBudgetMs, remaining);
        const deliverySignal = budgetSignal(deliveryBudgetMs, runSignal);
        try {
          const result = await raceWithAbort(
            deliverAlert({ alert, reading, env: alertEnv, claimAt, signal: deliverySignal }),
            deliverySignal,
            `alert delivery exceeded its ${deliveryBudgetMs}ms budget`,
          );
          deliveries.push(result);
          if (result.ok) {
            fired += 1;
            claims.settle(claim);
          } else {
            await releaseClaim();
          }
        } catch (err) {
          await releaseClaim();
          if (!isDeliveryAbandoned(err)) throw err;
          // Abandoned at the budget: the alert stays active and its claim goes
          // back to the queue, so the next tick retries it (at-least-once).
          const abandonedMessage = err instanceof Error ? err.message : String(err);
          elog.warn('alert delivery abandoned at its budget', {
            id: alert.id,
            err: abandonedMessage,
          });
          deliveries.push({
            alertId: alert.id,
            channel: 'delivery-budget',
            ok: false,
            abandoned: true,
            message: abandonedMessage,
          });
        }
      } catch (err) {
        errors.push({
          alertId: alert.id,
          message: err instanceof Error ? err.message : 'unknown evaluator error',
        });
      }
    }
  } finally {
    // R10 — a run that ends without a terminal outcome must not leave claims
    // held: that is a silent skip until the lease expires.
    claimsReleased = await claims.releaseAll();
  }

  if (stopReason !== 'complete' || claimsReleased > 0) {
    elog.info('alert run stopped with work outstanding', {
      stopReason,
      batch: alerts.length,
      fired,
      claimsReleased,
    });
  }

  return {
    total: alerts.length,
    matched,
    fired,
    skipped,
    errors,
    deliveries,
    stopReason,
    claimsReleased,
  };
}

// Re-exports so callers can run the orchestrator AND build human-readable
// labels for the same rule shape.
