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
 * Deadline propagation helpers (audit plan §1.7, Q3 strict).
 *
 * The synchronous committee path runs under the chat route's 55s abort
 * window. A 45s committee deadline converts a slow run into an explicit
 * `failedAgents` entry (→ `MastraModeStrictFailureError`) *before* the route
 * aborts, so the user sees a clear strict-failure instead of an opaque 502.
 * User-initiated cancellation still propagates as a plain abort.
 */

export interface DeadlineSignals {
  /** The caller's own cancellation signal (route abort, lease abort). */
  userSignal?: AbortSignal;
  /** Deadline timer signal, when a deadline is active. */
  deadlineSignal?: AbortSignal | null;
}

/**
 * Create the deadline signal for a run. `AbortSignal.timeout` is GC-friendly:
 * an un-fired timer never keeps the event loop alive.
 */
export function deadlineSignalFor(deadlineMs?: number): AbortSignal | null {
  return deadlineMs && deadlineMs > 0 ? AbortSignal.timeout(deadlineMs) : null;
}

/** Combine the user and deadline signals into the one passed to providers. */
export function combineRunSignal(signals: DeadlineSignals): AbortSignal | undefined {
  const { userSignal, deadlineSignal } = signals;
  if (userSignal && deadlineSignal) return AbortSignal.any([userSignal, deadlineSignal]);
  return userSignal ?? deadlineSignal ?? undefined;
}

/** True when the abort came from the deadline rather than the user. */
export function isDeadlineAbort(signals: DeadlineSignals): boolean {
  return signals.deadlineSignal?.aborted === true && signals.userSignal?.aborted !== true;
}

/**
 * Race a promise against a deadline. The wrapped operation receives the
 * combined signal so providers abort cooperatively; a deadline loss rejects
 * with a DOMException AbortError, matching user-cancel semantics.
 */
export async function withTimeout<T>(
  operation: (signal: AbortSignal | undefined) => Promise<T>,
  signals: DeadlineSignals,
): Promise<T> {
  const signal = combineRunSignal(signals);
  return operation(signal);
}
