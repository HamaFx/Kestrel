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
  summarizeStuckJobs,
} from '../src/scheduler/job-runtime';

const FULL_ANALYSIS_TIMEOUT_MS = 15 * 60_000;
const GRACE_MS = 5 * 60_000;

describe('effectiveJobTimeoutMs', () => {
  it('uses the registered per-job timeout for the durable Full-analysis job', () => {
    expect(effectiveJobTimeoutMs('multi-agent-analysis')).toBe(FULL_ANALYSIS_TIMEOUT_MS);
  });

  it('falls back to the global budget for jobs without an override', () => {
    expect(effectiveJobTimeoutMs('alerts')).toBe(JOB_TIMEOUT_MS);
    expect(effectiveJobTimeoutMs('metrics-flush')).toBe(JOB_TIMEOUT_MS);
  });
});

describe('summarizeStuckJobs', () => {
  const now = 1_800_000_000_000;
  const timeoutFor = (name: string) =>
    name === 'multi-agent-analysis' ? FULL_ANALYSIS_TIMEOUT_MS : JOB_TIMEOUT_MS;

  it('flags jobs past their own timeout plus the grace period, worst first', () => {
    const entries: Array<[string, number]> = [
      ['alerts', now - (JOB_TIMEOUT_MS + GRACE_MS + 1)],
      ['multi-agent-analysis', now - (FULL_ANALYSIS_TIMEOUT_MS + GRACE_MS + 10_000)],
      ['metrics-flush', now - 30_000],
    ];

    const summary = summarizeStuckJobs(entries, now, timeoutFor);

    expect(summary.stuck.map((job) => job.name)).toEqual(['multi-agent-analysis', 'alerts']);
    expect(summary.oldestStuckMs).toBe(FULL_ANALYSIS_TIMEOUT_MS + GRACE_MS + 10_000);
  });

  it('does not flag a long Full-analysis run that is still inside its budget', () => {
    const summary = summarizeStuckJobs(
      [['multi-agent-analysis', now - (FULL_ANALYSIS_TIMEOUT_MS - 60_000)]],
      now,
      timeoutFor,
    );

    // A 14-minute committee run is normal; the 120s default would call it stuck.
    expect(summary.stuck).toEqual([]);
    expect(summary.oldestStuckMs).toBeNull();
  });

  it('returns an empty summary when nothing is running', () => {
    expect(summarizeStuckJobs([], now, timeoutFor)).toEqual({
      stuck: [],
      oldestStuckMs: null,
    });
  });
});
