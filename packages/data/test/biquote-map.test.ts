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

// BiQuote symbol/timeframe/datetime mapping tests. Pure functions — no IO.

import { describe, expect, it } from 'vitest';

import { ProviderError } from '../src/errors';
import { assertSupportedSymbol } from '../src/providers/biquote/filter';
import {
  parseBiquoteDate,
  toBiquoteSymbol,
  toBiquoteTimeframe,
} from '../src/providers/biquote/map';

describe('biquote map', () => {
  it.each([
    ['XAUUSD', 'XAUUSD'],
    ['EURUSD', 'EURUSD'],
    ['GBPUSD', 'GBPUSD'],
    [' eurusd ', 'EURUSD'],
  ] as const)('maps %j to the canonical BiQuote symbol %s', (raw, canonical) => {
    expect(toBiquoteSymbol(raw)).toBe(canonical);
    expect(assertSupportedSymbol(raw)).toBe(canonical);
  });

  it.each([['BTCUSD'], ['BTCUSDT'], ['DOGEUSDT'], ['GARAN'], ['ZZZZZZ']] as const)(
    'fails fast for the unsupported or unmapped symbol %s',
    (raw) => {
      expect(() => toBiquoteSymbol(raw)).toThrow(/no catalog mapping/);
      expect(() => assertSupportedSymbol(raw)).toThrow(ProviderError);
    },
  );

  it('error message names the offender so debugging is fast', () => {
    try {
      assertSupportedSymbol('ZZZZZZ');
    } catch (err) {
      const e = err as ProviderError;
      expect(e.provider).toBe('biquote');
      expect(e.message).toContain('ZZZZZZ');
    }
  });

  it.each([
    ['1m', '1m'],
    ['5m', '5m'],
    ['15m', '15m'],
    ['30m', '30m'],
    ['1h', '1h'],
    ['4h', '4h'],
    ['1d', '1d'],
    ['1w', null],
  ] as const)('maps the %s timeframe to %j (null = unsupported by BiQuote)', (tf, expected) => {
    expect(toBiquoteTimeframe(tf)).toBe(expected);
  });

  it.each([
    ['2026-05-27T18:35:01Z', Date.UTC(2026, 4, 27, 18, 35, 1)],
    ['2026-05-27T18:35:01.234Z', Date.UTC(2026, 4, 27, 18, 35, 1) + 234],
  ] as const)('parses the BiQuote ISO-8601 timestamp %s as UTC', (iso, expected) => {
    expect(parseBiquoteDate(iso)).toBe(expected);
  });

  it('throws on unparseable datetime', () => {
    expect(() => parseBiquoteDate('not-a-date')).toThrow(/cannot parse datetime/);
  });
});
