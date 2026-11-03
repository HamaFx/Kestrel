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

// Provider-boundary time budgets for alert delivery (R10 — audit 2026-10-31).
//
// Delivery used to await every provider with no bound at all. Telegram's
// grammY client defaults to roughly 500s per request, so a single slow chat
// held the whole cron tick: every other user's alerts queued behind it, the
// job overran its 120s budget, and the alert's delivery claim stayed held for
// the full 30-minute lease.
//
// Two nested bounds are applied now:
//   - `DELIVERY_ATTEMPT_TIMEOUT_MS` — one channel of one alert.
//   - `ALERT_DELIVERY_BUDGET_MS` — every channel of one alert (the evaluator
//     applies this around the whole `deliverAlert` call).
//
// The signal is advisory for cooperative providers; `raceWithAbort` also
// guarantees the caller moves on when a channel ignores it entirely.

/**
 * Wall clock allowed for one channel attempt. A well-behaved Telegram send,
 * Resend post or web-push delivery answers in under two seconds; 20s is
 * already far past "something is wrong".
 */
export const DELIVERY_ATTEMPT_TIMEOUT_MS = 20_000;

/**
 * Wall clock allowed for one alert across all of its configured channels.
 * Three failing channels at the per-attempt bound still fit inside this.
 */
export const ALERT_DELIVERY_BUDGET_MS = 30_000;

/**
 * Combine a parent cancellation signal (job abort, run budget) with a fresh
 * per-call timeout. `AbortSignal.timeout` timers are GC-friendly and never
 * keep the event loop alive.
 */
export function budgetSignal(timeoutMs: number, parent?: AbortSignal | undefined): AbortSignal {
  const timeout = AbortSignal.timeout(Math.max(1, Math.trunc(timeoutMs)));
  return parent ? AbortSignal.any([parent, timeout]) : timeout;
}

/** Reason string used when an attempt is abandoned at its budget. */
class DeliveryAbandonedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeliveryAbandonedError';
  }
}

/**
 * Reject as soon as `signal` aborts, even when `promise` never settles.
 *
 * The abandoned promise keeps running in the background: the caller must not
 * treat a lost race as "nothing was sent" — the alert claim is released so a
 * later tick retries (at-least-once, never silently skipped).
 */
export function raceWithAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal,
  message: string,
): Promise<T> {
  if (signal.aborted) return Promise.reject(new DeliveryAbandonedError(message));

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DeliveryAbandonedError(message));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (err: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

/** True when the error came from an attempt abandoned at its budget. */
export function isDeliveryAbandoned(err: unknown): boolean {
  return err instanceof DeliveryAbandonedError;
}
