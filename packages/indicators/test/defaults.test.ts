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
  it.each([
    ['1m', 2],
    ['5m', 2],
    ['15m', 3],
    ['30m', 3],
    ['1h', 3],
    ['4h', 5],
    ['1d', 5],
    ['1w', 5],
  ] as const)('returns %i lookback bars for the %s timeframe', (tf, expected) => {
    expect(defaultSwingLookback(tf)).toBe(expected);
  });
});
