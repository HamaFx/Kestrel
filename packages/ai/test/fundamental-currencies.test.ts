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

import { getSymbolDefinition } from '@kestrel/shared';
import { describe, expect, it } from 'vitest';

import { getCalendarTool } from '../src/tools/get-calendar';

describe('cross-asset fundamental currencies & calendar (F-04)', () => {
  it('get_calendar accepts all G8 currencies in inputSchema', () => {
    const schema = getCalendarTool.inputSchema as {
      safeParse: (v: unknown) => { success: boolean; data?: unknown };
    };

    const g8Currencies = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'NZD', 'CHF'];
    for (const cur of g8Currencies) {
      const parsed = schema.safeParse({ currencies: [cur] });
      expect(parsed.success).toBe(true);
    }

    const invalid = schema.safeParse({ currencies: ['XYZ'] });
    expect(invalid.success).toBe(false);
  });

  it('symbol catalog resolves currencies for cross pairs, crypto, and metals', () => {
    expect(getSymbolDefinition('EURJPY').currencies).toEqual(
      expect.arrayContaining(['EUR', 'JPY']),
    );
    expect(getSymbolDefinition('GBPJPY').currencies).toEqual(
      expect.arrayContaining(['GBP', 'JPY']),
    );
    expect(getSymbolDefinition('AUDJPY').currencies).toEqual(
      expect.arrayContaining(['AUD', 'JPY']),
    );
    expect(getSymbolDefinition('EURGBP').currencies).toEqual(
      expect.arrayContaining(['EUR', 'GBP']),
    );
    expect(getSymbolDefinition('BTCUSDT').currencies).toEqual(
      expect.arrayContaining(['USD', 'USDT', 'BTC']),
    );
    expect(getSymbolDefinition('ETHUSDT').currencies).toEqual(
      expect.arrayContaining(['USD', 'USDT', 'ETH']),
    );
    expect(getSymbolDefinition('XAUUSD').currencies).toEqual(
      expect.arrayContaining(['USD', 'XAU']),
    );
  });
});
