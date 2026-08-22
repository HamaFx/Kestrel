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

import { tool } from 'ai';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { adaptLegacyReadOnlyTools } from '../src/mastra/legacy-tool-adapter';

describe('Mastra specialist tool adaptation', () => {
  it('preserves specialist names while converting legacy tools to executable Mastra tools', () => {
    const legacyTools = {
      get_price: tool({
        description: 'Read the current price',
        inputSchema: z.object({ symbol: z.string() }),
        execute: async ({ symbol }) => ({ symbol, value: 123 }),
      }),
      get_candles: tool({
        description: 'Read candles',
        inputSchema: z.object({ symbol: z.string() }),
        execute: async ({ symbol }) => ({ symbol, candles: [] }),
      }),
    };

    const mastraTools = adaptLegacyReadOnlyTools(legacyTools);

    expect(Object.keys(mastraTools)).toEqual(['get_price', 'get_candles']);
    expect(mastraTools.get_price).toMatchObject({
      id: 'kestrel-get_price',
      description: 'Read the current price',
    });
    expect(typeof mastraTools.get_price!.execute).toBe('function');
    expect(typeof mastraTools.get_candles!.execute).toBe('function');
  });

  it('fails closed when a specialist tool has no executor', () => {
    expect(() =>
      adaptLegacyReadOnlyTools({
        malformed: { description: 'not executable' } as never,
      }),
    ).toThrow('Cannot adapt malformed');
  });

  it('rejects mutation tools even if a caller accidentally includes one', () => {
    expect(() =>
      adaptLegacyReadOnlyTools({
        set_alert: { description: 'write alert' } as never,
      }),
    ).toThrow('mutation tools are forbidden');
  });
});
