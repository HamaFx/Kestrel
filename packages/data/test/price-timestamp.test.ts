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

import { getPriceWithMeta } from '../src/adapters/price';
import { marketDataProviders, type MarketDataProvider } from '../src/providers/provider-registry';

describe('Price quote observation timestamp preservation (F-10)', () => {
  it('preserves observedAt timestamp from provider instead of overwriting with live Date.now()', async () => {
    const historicalObservedAt = Date.parse('2026-05-01T21:59:58.000Z');

    // Register a mock provider that reports a historical quote (e.g. Friday close over the weekend)
    const mockProvider: MarketDataProvider = {
      name: 'mock-weekend-provider',
      label: 'Mock Weekend Provider',
      pinned: true,
      async fetchPrice() {
        return {
          price: 2400.5,
          provider: 'mock-weekend-provider',
          observedAt: historicalObservedAt,
          ageMs: 86400000,
        };
      },
      supports() {
        return true;
      },
    };

    marketDataProviders.register(mockProvider);

    const result = await getPriceWithMeta('XAUUSD', {
      marketDataProvider: 'mock-weekend-provider',
      ttlSeconds: 0,
    });

    expect(result.tick.mid).toBe(2400.5);
    // The tick timestamp must match the provider's observation time, not live now
    expect(result.tick.ts).toBe(historicalObservedAt);
  });
});
