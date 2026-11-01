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

// Delivery-claim bookkeeping for one evaluator run (R10 — audit 2026-10-31).
//
// `claimAlertDelivery` takes a lease before any external call. A run that ends
// without a terminal outcome for that alert (job abort, run budget, a delivery
// abandoned mid-flight) must hand the claim back: a held claim is a *silent
// skip* for as long as the lease lasts, and the audit is explicit that a
// duplicate send is acceptable while a silent skip is not.

import { createCategorizedLogger } from '@kestrel/shared/logger';

import { releaseAlertDeliveryClaim } from '../persistence';

const cllog = createCategorizedLogger('ai', { component: 'alerts-claims' });

export interface PendingDeliveryClaim {
  userId: string;
  alertId: string;
  claimAt: Date;
}

function claimKey(claim: PendingDeliveryClaim): string {
  return `${claim.userId}:${claim.alertId}:${claim.claimAt.getTime()}`;
}

/**
 * Claims this run is holding but has not settled yet.
 *
 * `releaseAll` is idempotent: a claim that a delivery already settled (fired
 * or released) is removed by `settle`, and the conditional UPDATE inside
 * `releaseAlertDeliveryClaim` only clears the row while it still carries this
 * run's timestamp — so a claim a later runner has since taken is never stolen.
 */
export class DeliveryClaimLedger {
  private readonly pending = new Map<string, PendingDeliveryClaim>();

  add(claim: PendingDeliveryClaim): void {
    this.pending.set(claimKey(claim), claim);
  }

  /** The delivery reached a terminal outcome; the evaluator released it. */
  settle(claim: PendingDeliveryClaim): void {
    this.pending.delete(claimKey(claim));
  }

  get size(): number {
    return this.pending.size;
  }

  /** Hand every still-held claim back to the queue; returns how many. */
  async releaseAll(): Promise<number> {
    const claims = [...this.pending.values()];
    this.pending.clear();
    let released = 0;
    for (const claim of claims) {
      try {
        await releaseAlertDeliveryClaim(claim.userId, claim.alertId, claim.claimAt);
        released += 1;
      } catch (err) {
        cllog.warn('failed to release a delivery claim after an incomplete run', {
          alertId: claim.alertId,
          userId: claim.userId,
          err: String(err),
        });
      }
    }
    return released;
  }
}
