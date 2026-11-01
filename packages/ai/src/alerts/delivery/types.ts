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

// Shared alert-delivery shapes (DEC-05 split from delivery.ts). Leaf module:
// no runtime imports of the evaluator or the channel adapters, so every
// other delivery sibling can depend on it without a cycle.

import type { Alert } from '@kestrel/shared';

import type { EvaluatorEnv } from '../evaluator/env';
import type { RuleReading } from '../spec';

export interface DeliveryResult {
  alertId: string;
  channel: string;
  ok: boolean;
  message?: string;
  /**
   * True when the attempt was abandoned at its time budget after the provider
   * accepted. The alert stays active so a later tick retries; callers must not
   * record dedup/cooldown state for it.
   */
  abandoned?: boolean | undefined;
}

export interface DeliverArgs {
  alert: Alert;
  reading: RuleReading;
  env: EvaluatorEnv;
  /** Lease acquired by the evaluator before invoking external providers. */
  claimAt?: Date | undefined;
  /**
   * Run cancellation (job abort / run budget) combined with this alert's own
   * delivery budget. Channels must pass it to their provider call so a hung
   * HTTP request is cut off instead of holding the cron tick.
   */
  signal?: AbortSignal | undefined;
  /**
   * Override the per-channel attempt budget for this delivery. Defaults to
   * `DELIVERY_ATTEMPT_TIMEOUT_MS`; the evaluator wraps the whole alert in its
   * own budget, so this only has to bound a single channel.
   */
  attemptTimeoutMs?: number | undefined;
}
