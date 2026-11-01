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

// R13 (audit 2026-10-31) — how persisted rows behave once the alert rule schema
// refuses a non-positive price level.
//
// Backward compatibility is "the row survives, the nonsense rule is skipped":
// `rowToAlert` throws, and `listAlerts` / `listEvaluable` catch that per row and
// log `skipping unparseable rule` (the existing behaviour for a malformed rule),
// so nothing ever fires on a price no market could print. Indicator levels keep
// parsing, including the zero and negative values oscillators legitimately use.

import type { schema } from '@kestrel/db';
import { describe, expect, it } from 'vitest';

import { rowToAlert } from '../src/alerts/persistence/rows';

type AlertRow = typeof schema.alerts.$inferSelect;

function row(rule: unknown): AlertRow {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    userId: 'user-1',
    tenantId: 'tenant-1',
    rule,
    channels: ['email'],
    note: null,
    active: true,
    firedAt: null,
    lastFiredAt: null,
    deliveryClaimedAt: null,
    snoozeHours: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  } as unknown as AlertRow;
}

describe('rowToAlert — R13 price-level bound', () => {
  it('maps a persisted positive price rule', () => {
    const alert = rowToAlert(
      row({ type: 'priceCross', symbol: 'XAUUSD', level: 2400, direction: 'above' }),
    );
    expect(alert.rule).toMatchObject({ level: 2400 });
  });

  it('refuses to map a persisted non-positive price rule so the cron skips it', () => {
    expect(() =>
      rowToAlert(row({ type: 'priceCross', symbol: 'XAUUSD', level: 0, direction: 'above' })),
    ).toThrow();
    expect(() =>
      rowToAlert(row({ type: 'priceCross', symbol: 'XAUUSD', level: -1, direction: 'below' })),
    ).toThrow();
  });

  it('still maps legacy indicator rules with a zero or negative level', () => {
    const zero = rowToAlert(
      row({
        type: 'indicatorCross',
        symbol: 'XAUUSD',
        tf: '1h',
        indicator: 'macd',
        level: 0,
        direction: 'above',
      }),
    );
    const negative = rowToAlert(
      row({
        type: 'indicatorCross',
        symbol: 'XAUUSD',
        tf: '1h',
        indicator: 'macd',
        level: -0.5,
        direction: 'above',
      }),
    );
    expect(zero.rule).toMatchObject({ level: 0 });
    expect(negative.rule).toMatchObject({ level: -0.5 });
  });
});
