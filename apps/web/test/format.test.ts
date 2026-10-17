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

import { formatRelative } from '../src/lib/format';

const NOW = 1_700_000_000_000;
const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

describe('formatRelative', () => {
  it.each<{ label: string; timestamp: number; expected: string }>([
    { label: 'a future timestamp', timestamp: NOW + 1000, expected: 'just now' },
    { label: 'a 30s-old timestamp', timestamp: NOW - 30_000, expected: 'just now' },
    { label: 'a 59_999ms-old timestamp', timestamp: NOW - 59_999, expected: 'just now' },
    { label: 'a 0ms difference', timestamp: NOW, expected: 'just now' },
    { label: 'exactly 60s', timestamp: NOW - MINUTE, expected: '1m ago' },
    { label: '~5 minutes', timestamp: NOW - 5 * MINUTE, expected: '5m ago' },
    { label: '59 minutes', timestamp: NOW - 59 * MINUTE, expected: '59m ago' },
    {
      label: '90s (floors minutes rather than rounding)',
      timestamp: NOW - 90_000,
      expected: '1m ago',
    },
    { label: 'exactly 1 hour', timestamp: NOW - HOUR, expected: '1h ago' },
    { label: '~2 hours', timestamp: NOW - 2 * HOUR, expected: '2h ago' },
    { label: '23 hours (just under a day)', timestamp: NOW - 23 * HOUR, expected: '23h ago' },
    { label: 'exactly 24 hours', timestamp: NOW - DAY, expected: '1d ago' },
    { label: '6 days (just under a week)', timestamp: NOW - 6 * DAY, expected: '6d ago' },
    { label: 'exactly 7 days', timestamp: NOW - 7 * DAY, expected: '1w ago' },
    { label: '~3 weeks', timestamp: NOW - 21 * DAY, expected: '3w ago' },
    { label: '~4 weeks', timestamp: NOW - 28 * DAY, expected: '4w ago' },
  ])('formats the $label bucket', ({ timestamp, expected }) => {
    expect(formatRelative(timestamp, NOW)).toBe(expected);
  });

  it('returns a locale date string for > 30 days', () => {
    const old = NOW - 31 * DAY;
    const result = formatRelative(old, NOW);
    expect(result).not.toMatch(/^\d+[mhdw] ago$/);
    expect(result.length).toBeGreaterThan(0);
  });

  it.each([
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['-Infinity', -Infinity],
  ] as const)('returns an empty string for a %s timestamp', (_label, timestamp) => {
    expect(formatRelative(timestamp, NOW)).toBe('');
  });

  it.each([
    ['an ISO string timestamp', new Date(NOW - 2 * MINUTE).toISOString(), '2m ago'],
    ['a Date object timestamp', new Date(NOW - HOUR), '1h ago'],
  ] as const)('accepts %s', (_label, timestamp, expected) => {
    expect(formatRelative(timestamp, NOW)).toBe(expected);
  });

  it('returns an empty string for a string that is not a valid date', () => {
    expect(formatRelative('not-a-date', NOW)).toBe('');
  });

  it('returns "just now" for a tiny negative diff due to clock drift', () => {
    expect(formatRelative(NOW + 10, NOW)).toBe('just now');
  });
});
