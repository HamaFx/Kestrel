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

import { describe, expect, it } from 'vitest';

import {
  assertValidTradeLevels,
  MAX_PRICE_VALUE,
  validateTradeLevels,
} from '../src/domain/trade-levels';

describe('validateTradeLevels', () => {
  it('accepts a BTC-priced long', () => {
    expect(
      validateTradeLevels({
        side: 'long',
        entry: 60_000,
        stop: 59_000,
        target: 62_000,
        exit: 61_000,
      }),
    ).toBeNull();
  });

  it('accepts a short with stop above and target below', () => {
    expect(
      validateTradeLevels({
        side: 'short',
        entry: 60_000,
        stop: 61_000,
        target: 58_000,
      }),
    ).toBeNull();
  });

  it('rejects a stop on the wrong side', () => {
    expect(validateTradeLevels({ side: 'long', entry: 60_000, stop: 61_000 })).toMatch(/below/);
    expect(validateTradeLevels({ side: 'short', entry: 60_000, stop: 59_000 })).toMatch(/above/);
  });

  it('rejects a target on the wrong side', () => {
    expect(validateTradeLevels({ side: 'long', entry: 60_000, target: 59_000 })).toMatch(/above/);
    expect(validateTradeLevels({ side: 'short', entry: 60_000, target: 61_000 })).toMatch(/below/);
  });

  it('bounds prices at MAX_PRICE_VALUE', () => {
    expect(validateTradeLevels({ side: 'long', entry: MAX_PRICE_VALUE, stop: 1 })).toBeNull();
    expect(validateTradeLevels({ side: 'long', entry: MAX_PRICE_VALUE + 1, stop: 1 })).toMatch(
      /at most/,
    );
  });

  it('rejects non-positive and non-finite values', () => {
    expect(validateTradeLevels({ side: 'long', entry: 0 })).toMatch(/greater than zero/);
    expect(validateTradeLevels({ side: 'long', entry: Number.NaN })).toMatch(/finite/);
    expect(
      validateTradeLevels({ side: 'long', entry: 100, stop: Number.POSITIVE_INFINITY }),
    ).toMatch(/finite/);
  });

  it('does not reject an open trade without exit or stop', () => {
    expect(validateTradeLevels({ side: 'long', entry: 60_000 })).toBeNull();
  });
});

describe('assertValidTradeLevels', () => {
  it('throws a RangeError with the reason', () => {
    expect(() => assertValidTradeLevels({ side: 'long', entry: 60_000, stop: 61_000 })).toThrow(
      RangeError,
    );
  });

  it('returns for coherent levels', () => {
    expect(() =>
      assertValidTradeLevels({ side: 'long', entry: 60_000, stop: 59_000 }),
    ).not.toThrow();
  });
});
