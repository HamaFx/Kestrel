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

// Timer helpers shared by the durable candle write path (R9, audit
// 2026-10-31): the retry backoff in `candle-writer.ts`, the bounded durable
// hand-off in `candle-queue.ts`, and the shutdown waits in `candle-flush.ts`
// and `candle-gaps.ts`.
//
// Every timer is unref'd so a pending backoff or shutdown wait never keeps
// the process alive on its own.

/** Sleep for `ms`, without holding the event loop open. */
export function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref();
  });
}

/**
 * Resolve with the promise's value, or the literal `'timeout'` after `ms`.
 *
 * The raced promise is not cancelled: callers only use this to bound how
 * long they wait, and the operations it wraps are idempotent (a durable
 * hand-off that lands late inserts the same bar, which is a no-op).
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | 'timeout'> {
  return Promise.race([promise, sleep(ms).then(() => 'timeout' as const)]);
}
