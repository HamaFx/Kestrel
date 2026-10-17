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

import { parseIndicatorSpec } from '../src/alerts/evaluator';

describe('parseIndicatorSpec — strict', () => {
  it.each([
    ['rsi', { kind: 'rsi', params: { period: 14 } }],
    ['ema', { kind: 'ema', params: { period: 20 } }],
    ['rsi:14', { kind: 'rsi', params: { period: 14 } }],
    ['ema:50', { kind: 'ema', params: { period: 50 } }],
    ['atr:21', { kind: 'atr', params: { period: 21 } }],
    ['macd:12,26,9', { kind: 'macd', params: { fast: 12, slow: 26, signal: 9 } }],
    ['bollinger:20,2', { kind: 'bollinger', params: { period: 20, multiplier: 2 } }],
    ['pivots', { kind: 'pivots', params: {} }],
    ['RSI:14', { kind: 'rsi', params: { period: 14 } }],
  ] as const)('parses %j into the expected indicator spec', (spec, expected) => {
    expect(parseIndicatorSpec(spec)).toEqual(expected);
  });

  it.each([
    'rsi:14:bogus',
    'ema:14,bogus',
    'rsi 14',
    'foo',
    'foo:14',
    'rsi:14,9',
    'ema:14,21,55',
    'rsi:0',
    'rsi:-5',
    'pivots:1',
    '',
  ] as const)('rejects the invalid spec %j', (spec) => {
    expect(parseIndicatorSpec(spec)).toBeNull();
  });
});
