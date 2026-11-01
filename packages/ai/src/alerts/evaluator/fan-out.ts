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

// Fair fan-out over the bounded alert batch (R10 — audit 2026-10-31).
//
// The evaluator delivers one alert at a time, so the order of the batch is the
// order users get served. `listEvaluable` bounds how many alerts a tick takes
// and rotates which ones; this module makes sure that inside one batch a user
// with a storm of matching alerts does not push every other user to the back
// of the queue. Each user's alerts keep their relative order, and users are
// served round-robin.

/** Why a run stopped before exhausting what it could evaluate. */
export type EvaluationStopReason = 'complete' | 'budget' | 'aborted';

/**
 * Round-robin the batch by `userId`.
 *
 * Pure and stable: the first appearance of a user fixes its position in the
 * rotation, and each user's own alerts keep the order they arrived in.
 */
export function interleaveByUser<T extends { userId: string }>(alerts: readonly T[]): T[] {
  const queues = new Map<string, T[]>();
  for (const alert of alerts) {
    const queue = queues.get(alert.userId);
    if (queue) queue.push(alert);
    else queues.set(alert.userId, [alert]);
  }

  const buckets = [...queues.values()];
  const longest = buckets.reduce((max, bucket) => Math.max(max, bucket.length), 0);
  const out: T[] = [];
  for (let round = 0; round < longest; round += 1) {
    for (const bucket of buckets) {
      const next = bucket[round];
      if (next !== undefined) out.push(next);
    }
  }
  return out;
}
