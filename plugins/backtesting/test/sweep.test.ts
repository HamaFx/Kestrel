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

import { SweepInputSchema } from '../src/schemas';
import { expandParameterSpace } from '../src/services/sweep-service';

describe('parameter sweeps', () => {
  it('expands a cartesian product over the base params', () => {
    const combinations = expandParameterSpace(
      { riskPct: 1, threshold: 0.5 },
      [
        { name: 'threshold', values: [0.5, 0.75] },
        { name: 'atrMult', values: [1, 2, 3] },
      ],
      20,
    );
    expect(combinations).toHaveLength(6);
    expect(combinations[0]).toMatchObject({ riskPct: 1, threshold: 0.5, atrMult: 1 });
    expect(combinations.at(-1)).toMatchObject({ threshold: 0.75, atrMult: 3 });
  });

  it('fails closed when the grid exceeds the cap', () => {
    expect(() =>
      expandParameterSpace(
        {},
        [
          { name: 'a', values: [1, 2, 3, 4] },
          { name: 'b', values: [1, 2, 3, 4] },
        ],
        10,
      ),
    ).toThrow(/exceeds the 10-combination limit/);
  });

  it('requires a saved strategy or inline source', () => {
    const result = SweepInputSchema.safeParse({
      symbol: 'XAUUSD',
      timeframe: '1h',
      parameterSpace: [{ name: 'threshold', values: [1, 2] }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts a saved strategy with a parameter grid', () => {
    const result = SweepInputSchema.safeParse({
      strategyId: 'strategy-1',
      symbol: 'XAUUSD',
      timeframe: '1h',
      parameterSpace: [{ name: 'threshold', values: [1, 2] }],
      objective: 'expectancyR',
    });
    expect(result.success).toBe(true);
  });
});
