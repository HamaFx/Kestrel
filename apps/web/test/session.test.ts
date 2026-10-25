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

import { getSessionInfo, type TradingSession } from '../src/lib/auth/session';

/**
 * Helper to build a UTC Date at a specific (year, month-1, day, hour, minute).
 * Months are 0-indexed so callers can write 5 for June.
 */
function utc(year: number, month: number, day: number, hour: number, minute = 0): Date {
  return new Date(Date.UTC(year, month, day, hour, minute, 0));
}

const CASES: Array<{
  label: string;
  date: Date;
  expectedSession: TradingSession;
  expectedLabel: string;
  expectedWeekday: number;
}> = [
  // Wednesday session windows and boundaries (2026-06-17 is a Wednesday).
  {
    label: 'Wednesday 00:00 UTC (midnight roll-over) as Asian',
    date: utc(2026, 5, 17, 0),
    expectedSession: 'asian',
    expectedLabel: 'Asian',
    expectedWeekday: 3,
  },
  {
    label: 'Wednesday 03:00 UTC as Asian',
    date: utc(2026, 5, 17, 3),
    expectedSession: 'asian',
    expectedLabel: 'Asian',
    expectedWeekday: 3,
  },
  {
    label: 'Wednesday 06:59 UTC as Asian (boundary)',
    date: utc(2026, 5, 17, 6, 59),
    expectedSession: 'asian',
    expectedLabel: 'Asian',
    expectedWeekday: 3,
  },
  {
    label: 'Wednesday 07:00 UTC as London (boundary)',
    date: utc(2026, 5, 17, 7),
    expectedSession: 'london',
    expectedLabel: 'London',
    expectedWeekday: 3,
  },
  {
    label: 'Wednesday 10:00 UTC as London',
    date: utc(2026, 5, 17, 10),
    expectedSession: 'london',
    expectedLabel: 'London',
    expectedWeekday: 3,
  },
  {
    label: 'Wednesday 11:59 UTC as London (boundary)',
    date: utc(2026, 5, 17, 11, 59),
    expectedSession: 'london',
    expectedLabel: 'London',
    expectedWeekday: 3,
  },
  {
    label: 'Wednesday 12:00 UTC as NY (boundary)',
    date: utc(2026, 5, 17, 12),
    expectedSession: 'ny',
    expectedLabel: 'NY',
    expectedWeekday: 3,
  },
  {
    label: 'Wednesday 14:00 UTC as NY',
    date: utc(2026, 5, 17, 14),
    expectedSession: 'ny',
    expectedLabel: 'NY',
    expectedWeekday: 3,
  },
  {
    label: 'Wednesday 16:59 UTC as NY (boundary)',
    date: utc(2026, 5, 17, 16, 59),
    expectedSession: 'ny',
    expectedLabel: 'NY',
    expectedWeekday: 3,
  },
  {
    label: 'Wednesday 17:00 UTC as Closed (boundary)',
    date: utc(2026, 5, 17, 17),
    expectedSession: 'closed',
    expectedLabel: 'Closed',
    expectedWeekday: 3,
  },
  {
    label: 'Wednesday 20:00 UTC as Closed',
    date: utc(2026, 5, 17, 20),
    expectedSession: 'closed',
    expectedLabel: 'Closed',
    expectedWeekday: 3,
  },
  // Weekend window (Friday 22:00 UTC inclusive – Sunday 22:00 UTC exclusive).
  {
    label: 'Friday 21:59 UTC as still outside the weekend window',
    date: utc(2026, 5, 19, 21, 59),
    expectedSession: 'closed',
    expectedLabel: 'Closed',
    expectedWeekday: 5,
  },
  {
    label: 'Friday 22:00 UTC as the start of the weekend window',
    date: utc(2026, 5, 19, 22),
    expectedSession: 'weekend',
    expectedLabel: 'Weekend',
    expectedWeekday: 5,
  },
  {
    label: 'Saturday 12:00 UTC as Weekend',
    date: utc(2026, 5, 20, 12),
    expectedSession: 'weekend',
    expectedLabel: 'Weekend',
    expectedWeekday: 6,
  },
  {
    label: 'Sunday 12:00 UTC as Weekend',
    date: utc(2026, 5, 21, 12),
    expectedSession: 'weekend',
    expectedLabel: 'Weekend',
    expectedWeekday: 0,
  },
  {
    label: 'Sunday 21:59 UTC as still Weekend (boundary)',
    date: utc(2026, 5, 21, 21, 59),
    expectedSession: 'weekend',
    expectedLabel: 'Weekend',
    expectedWeekday: 0,
  },
  {
    label: 'Sunday 22:00 UTC as Closed (weekend window ends exclusive)',
    date: utc(2026, 5, 21, 22),
    expectedSession: 'closed',
    expectedLabel: 'Closed',
    expectedWeekday: 0,
  },
  {
    label: 'Sunday 23:00 UTC as Closed with weekday 0',
    date: utc(2026, 5, 21, 23),
    expectedSession: 'closed',
    expectedLabel: 'Closed',
    expectedWeekday: 0,
  },
  // Weekday field (2026-06-15 is a Monday).
  {
    label: 'Monday 10:00 UTC as London with weekday 1',
    date: utc(2026, 5, 15, 10),
    expectedSession: 'london',
    expectedLabel: 'London',
    expectedWeekday: 1,
  },
];

describe('getSessionInfo — UTC-anchored session cuts and weekend window', () => {
  it.each(CASES)(
    'classifies $label',
    ({ date, expectedSession, expectedLabel, expectedWeekday }) => {
      expect(getSessionInfo(date)).toEqual({
        session: expectedSession,
        label: expectedLabel,
        weekday: expectedWeekday,
      });
    },
  );
});
