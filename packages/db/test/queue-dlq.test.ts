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

// R16 (audit 2026-10-31) — dead-letter configuration. Before this, a backtest
// job that exhausted `retryLimit` sat failed and was deleted an hour later
// with nothing to alert on. These assertions are pure: they read the queue
// definitions rather than talking to Postgres.

import { describe, expect, it } from 'vitest';

import {
  BACKTEST_RUN_DLQ,
  BACKTEST_RUN_QUEUE,
  BACKTEST_SWEEP_DLQ,
  BACKTEST_SWEEP_QUEUE,
  DEAD_LETTER_QUEUE_OPTIONS,
  DEAD_LETTER_QUEUES,
  DEAD_LETTER_RETENTION_SECONDS,
  MANAGED_QUEUES,
} from '../src/queue';

describe('dead-letter queue configuration', () => {
  it('points every retrying queue at its own dead letter queue', () => {
    const names = MANAGED_QUEUES.map((queue) => queue.name);
    expect(names).toEqual([BACKTEST_RUN_QUEUE, BACKTEST_SWEEP_QUEUE]);
    for (const queue of MANAGED_QUEUES) {
      expect(queue.deadLetter).toBe(`${queue.name}-dlq`);
    }
  });

  it('keeps the queue and DLQ names distinct', () => {
    const sourceNames = new Set(MANAGED_QUEUES.map((queue) => queue.name));
    for (const dlq of DEAD_LETTER_QUEUES) {
      expect(sourceNames.has(dlq)).toBe(false);
    }
    expect(BACKTEST_RUN_DLQ).not.toBe(BACKTEST_RUN_QUEUE);
    expect(BACKTEST_SWEEP_DLQ).not.toBe(BACKTEST_SWEEP_QUEUE);
  });

  it('holds dead letters for 30 days so there is time to alert and redrive', () => {
    expect(DEAD_LETTER_RETENTION_SECONDS).toBe(30 * 24 * 3_600);
    expect(DEAD_LETTER_QUEUE_OPTIONS.retentionSeconds).toBe(DEAD_LETTER_RETENTION_SECONDS);
    // A DLQ is never worked, so retries are meaningless; failing terminally
    // is what avoids a redrive loop.
    expect(DEAD_LETTER_QUEUE_OPTIONS.retryLimit).toBe(0);
  });

  it('retains failures far longer than the source queue deletes completions', () => {
    for (const queue of MANAGED_QUEUES) {
      expect(DEAD_LETTER_QUEUE_OPTIONS.retentionSeconds ?? 0).toBeGreaterThan(
        queue.options.deleteAfterSeconds ?? 0,
      );
    }
  });
});
