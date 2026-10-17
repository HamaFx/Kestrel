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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { _resetHealth, getHealth, getScore, recordFailure, recordSuccess } from '../src/health';

type Sample = 'ok' | 'fail';

describe('provider health — Phase 7a', () => {
  beforeEach(() => {
    _resetHealth();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each<{ label: string; history: Sample[]; expectedScore: number }>([
    {
      label: 'reports the neutral 0.5 score with no samples',
      history: [],
      expectedScore: 0.5,
    },
    { label: 'scores 1 isolated failure at 0', history: ['fail'], expectedScore: 0 },
    { label: 'scores 2 consecutive failures at 0', history: ['fail', 'fail'], expectedScore: 0 },
    {
      label: 'scores 3 consecutive failures at 0',
      history: ['fail', 'fail', 'fail'],
      expectedScore: 0,
    },
    {
      label: 'scores 5 consecutive failures at 0',
      history: ['fail', 'fail', 'fail', 'fail', 'fail'],
      expectedScore: 0,
    },
    { label: 'scores one fresh success at 1', history: ['ok'], expectedScore: 1 },
    {
      label: 'scores a failure followed by a success at 0.5',
      history: ['fail', 'ok'],
      expectedScore: 0.5,
    },
    {
      label: 'weights an old isolated failure at 2/3',
      history: ['ok', 'ok', 'fail'],
      expectedScore: 2 / 3,
    },
    {
      label: 'recovers to 0.25 after 3 failures + 1 success',
      history: ['fail', 'fail', 'fail', 'ok'],
      expectedScore: 0.25,
    },
  ])('$label', ({ history, expectedScore }) => {
    for (const sample of history) {
      if (sample === 'ok') recordSuccess('twelve-data');
      else recordFailure('twelve-data');
    }

    expect(getScore('twelve-data')).toBeCloseTo(expectedScore);
  });

  it('reports the failure snapshot and recovers on a success', () => {
    recordFailure('twelve-data');
    recordFailure('twelve-data');
    recordFailure('twelve-data');
    expect(getHealth('twelve-data').failureRate).toBeCloseTo(1);
    expect(getScore('twelve-data')).toBe(0);

    recordSuccess('twelve-data');
    const h = getHealth('twelve-data');
    expect(h.ok).toBe(1);
    expect(h.failed).toBe(3);
    // 1/4 success → 0.25 score (1 - 0.75)
    expect(getScore('twelve-data')).toBeCloseTo(0.25);
  });

  it('forgets samples older than the 5-minute window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-26T00:00:00Z'));
    recordFailure('twelve-data');
    expect(getHealth('twelve-data').samples).toBe(1);

    vi.advanceTimersByTime(6 * 60 * 1000); // 6 minutes
    expect(getHealth('twelve-data').samples).toBe(0);
    expect(getScore('twelve-data')).toBe(0.5);
  });
});
