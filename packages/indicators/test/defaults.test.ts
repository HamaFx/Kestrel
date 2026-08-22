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

import { defaultSwingLookback } from '../src/smc/defaults';

describe('defaultSwingLookback', () => {
  it('returns 2 for 1m timeframe', () => {
    expect(defaultSwingLookback('1m')).toBe(2);
  });

  it('returns 2 for 5m timeframe', () => {
    expect(defaultSwingLookback('5m')).toBe(2);
  });

  it('returns 3 for 15m', () => {
    expect(defaultSwingLookback('15m')).toBe(3);
  });

  it('returns 3 for 30m', () => {
    expect(defaultSwingLookback('30m')).toBe(3);
  });

  it('returns 3 for 1h', () => {
    expect(defaultSwingLookback('1h')).toBe(3);
  });

  it('returns 5 for 4h', () => {
    expect(defaultSwingLookback('4h')).toBe(5);
  });

  it('returns 5 for 1d', () => {
    expect(defaultSwingLookback('1d')).toBe(5);
  });

  it('returns 5 for 1w', () => {
    expect(defaultSwingLookback('1w')).toBe(5);
  });
});
