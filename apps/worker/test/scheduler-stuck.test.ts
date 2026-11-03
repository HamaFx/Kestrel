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

// STAB-19 follow-up: a job wedged past its budget holds its in-flight guard
// until the promise settles, so it would never run again. These helpers feed
// the health endpoint that trips the container healthcheck + autoheal.

import { describe, expect, it } from 'vitest';

import {
  effectiveJobTimeoutMs,
  JOB_TIMEOUT_MS,
  summarizeJobHealth,
  summarizeStuckJobs,
} from '../src/scheduler/job-runtime';

const GRACE_MS = 5 * 60_000;

describe('effectiveJobTimeoutMs', () => {
  it('falls back to the global budget for jobs without an override', () => {
    expect(effectiveJobTimeoutMs('alerts')).toBe(JOB_TIMEOUT_MS);
    expect(effectiveJobTimeoutMs('briefings')).toBe(JOB_TIMEOUT_MS);
  });
});

describe('summarizeJobHealth (R16 busy versus wedged)', () => {
  const now = 1_800_000_000_000;
  const timeoutFor = () => JOB_TIMEOUT_MS;

  it('classifies a run inside its budget as busy, not wedged', () => {
    const summary = summarizeJobHealth(
      [
        ['alerts', now - 30_000],
        ['briefings', now - 60_000],
      ],
      now,
      timeoutFor,
    );

    expect(summary.stuck).toEqual([]);
    expect(summary.running.map((job) => job.name)).toEqual(['briefings', 'alerts']);
    expect(summary.running[1]?.runningForMs).toBe(30_000);
  });

  it('classifies a job past its budget plus grace as wedged', () => {
    const summary = summarizeJobHealth(
      [['alerts', now - (JOB_TIMEOUT_MS + GRACE_MS + 1)]],
      now,
      timeoutFor,
    );

    expect(summary.running).toEqual([]);
    expect(summary.stuck).toEqual([{ name: 'alerts', stuckForMs: JOB_TIMEOUT_MS + GRACE_MS + 1 }]);
    expect(summary.oldestStuckMs).toBe(JOB_TIMEOUT_MS + GRACE_MS + 1);
  });

  it('keeps busy and wedged jobs in separate buckets in one pass', () => {
    const summary = summarizeJobHealth(
      [
        ['alerts', now - 5_000],
        ['briefings', now - (JOB_TIMEOUT_MS + GRACE_MS + 30_000)],
      ],
      now,
      timeoutFor,
    );

    expect(summary.running.map((job) => job.name)).toEqual(['alerts']);
    expect(summary.stuck.map((job) => job.name)).toEqual(['briefings']);
  });
});

describe('summarizeStuckJobs', () => {
  const now = 1_800_000_000_000;
  const timeoutFor = () => JOB_TIMEOUT_MS;

  it('flags jobs past their own timeout plus the grace period, worst first', () => {
    const entries: Array<[string, number]> = [
      ['alerts', now - (JOB_TIMEOUT_MS + GRACE_MS + 1)],
      ['briefings', now - (JOB_TIMEOUT_MS + GRACE_MS + 10_000)],
      ['cot', now - 30_000],
    ];

    const summary = summarizeStuckJobs(entries, now, timeoutFor);

    expect(summary.stuck.map((job) => job.name)).toEqual(['briefings', 'alerts']);
    expect(summary.oldestStuckMs).toBe(JOB_TIMEOUT_MS + GRACE_MS + 10_000);
  });

  it('returns an empty summary when nothing is running', () => {
    expect(summarizeStuckJobs([], now, timeoutFor)).toEqual({
      stuck: [],
      oldestStuckMs: null,
    });
  });
});
