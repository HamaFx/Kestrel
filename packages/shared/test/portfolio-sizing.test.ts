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

import { getContractSize, getPipValue, lotUnits } from '../src';

describe('portfolio sizing and contract specifications (F-03)', () => {
  it('resolves correct contract sizes across asset classes', () => {
    // Forex
    expect(getContractSize('EURUSD')).toBe(100_000);
    expect(getContractSize('GBPUSD')).toBe(100_000);
    expect(getContractSize('USDJPY')).toBe(100_000);

    // Metals
    expect(getContractSize('XAUUSD')).toBe(100);

    // Crypto
    expect(getContractSize('BTCUSDT')).toBe(1);
    expect(getContractSize('ETHUSDT')).toBe(1);
    expect(getContractSize('SOLUSDT')).toBe(1);

    // Alias lotUnits
    expect(lotUnits('BTCUSDT')).toBe(1);
    expect(lotUnits('XAUUSD')).toBe(100);
  });

  it('computes pip values accurately per asset class', () => {
    // EURUSD: 0.0001 * 100,000 * 1 = $10
    expect(getPipValue('EURUSD', 1)).toBeCloseTo(10, 4);

    // XAUUSD: 0.1 * 100 * 1 = $10
    expect(getPipValue('XAUUSD', 1)).toBeCloseTo(10, 4);

    // BTCUSDT: 0.01 * 1 * 1 = $0.01
    expect(getPipValue('BTCUSDT', 1)).toBeCloseTo(0.01, 4);
  });
});
