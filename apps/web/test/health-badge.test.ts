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

import { describe, expect, it } from 'vitest';

import { getHealthTone, type HealthTone } from '../src/components/ui/health-tone';

const NOW = Date.parse('2026-06-20T12:00:00.000Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

interface HealthSnapshot {
  ok: boolean;
  error: string | null;
  testedAt: string;
}

function healthAt(ageMs: number, ok = true, error: string | null = null): HealthSnapshot {
  return { ok, error, testedAt: new Date(NOW - ageMs).toISOString() };
}

const CASES: Array<{ label: string; health: HealthSnapshot | undefined; expected: HealthTone }> = [
  { label: 'no health snapshot exists', health: undefined, expected: 'grey' },
  {
    label: 'a failure 5 minutes ago (sticky red)',
    health: healthAt(5 * 60_000, false, 'HTTP 401'),
    expected: 'red',
  },
  {
    label: 'a stale failure 10 days old (failures are sticky)',
    health: healthAt(10 * DAY, false, 'rate limited'),
    expected: 'red',
  },
  {
    label: 'a success 1 hour ago',
    health: healthAt(HOUR, true),
    expected: 'green',
  },
  {
    label: 'a success just under 24h old (boundary)',
    health: healthAt(24 * HOUR - 1, true),
    expected: 'green',
  },
  {
    label: 'a success exactly 24h old (boundary)',
    health: healthAt(24 * HOUR, true),
    expected: 'yellow',
  },
  {
    label: 'a success 3 days old',
    health: healthAt(3 * DAY, true),
    expected: 'yellow',
  },
  {
    label: 'a success just under 7 days old (boundary)',
    health: healthAt(7 * DAY - 1, true),
    expected: 'yellow',
  },
  {
    label: 'a success exactly 7 days old (boundary, treated as unknown)',
    health: healthAt(7 * DAY, true),
    expected: 'grey',
  },
  {
    label: 'a success 30 days old',
    health: healthAt(30 * DAY, true),
    expected: 'grey',
  },
  {
    label: 'an invalid testedAt (safe default)',
    health: { ok: true, error: null, testedAt: 'not-a-date' },
    expected: 'grey',
  },
];

describe('getHealthTone — provider health badge logic', () => {
  it.each(CASES)('returns the expected tone when $label', ({ health, expected }) => {
    expect(getHealthTone(health, NOW)).toBe(expected);
  });
});
