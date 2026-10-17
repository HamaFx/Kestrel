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
  isKnownSymbol,
  normalizeSymbol,
  normalizeTimeframe,
  SymbolSchema,
  TimeframeSchema,
} from '../src';

describe('Symbol and Timeframe Normalization (F-01)', () => {
  describe('Symbol normalization and alias resolution', () => {
    it.each([
      ['Gold', 'XAUUSD'],
      ['gold', 'XAUUSD'],
      ['XAU/USD', 'XAUUSD'],
      ['XAU_USD', 'XAUUSD'],
      ['OANDA:XAU_USD', 'XAUUSD'],
      ['SPOT:GOLD', 'XAUUSD'],
      ['EUR/USD', 'EURUSD'],
      ['FX:EUR_USD', 'EURUSD'],
      ['Cable', 'GBPUSD'],
      ['Fibre', 'EURUSD'],
      ['USD/JPY', 'USDJPY'],
      ['BTC', 'BTCUSDT'],
      ['BTCUSD', 'BTCUSDT'],
      ['BTC/USD', 'BTCUSDT'],
      ['Bitcoin', 'BTCUSDT'],
      ['BINANCE:BTCUSDT', 'BTCUSDT'],
      ['ETH', 'ETHUSDT'],
      ['ETH/USD', 'ETHUSDT'],
      ['Ethereum', 'ETHUSDT'],
      ['SOL', 'SOLUSDT'],
      ['SOL/USD', 'SOLUSDT'],
      ['BNB', 'BNBUSDT'],
      ['XRP', 'XRPUSDT'],
      ['ADA', 'ADAUSDT'],
      ['btc/usd', 'BTCUSDT'],
    ] as const)(
      'resolves %s -> %s through normalizeSymbol, SymbolSchema, and isKnownSymbol',
      (raw, canonical) => {
        expect(normalizeSymbol(raw)).toBe(canonical);
        expect(SymbolSchema.parse(raw)).toBe(canonical);
        expect(isKnownSymbol(raw)).toBe(true);
      },
    );

    it.each([['US100'], ['XAGUSD'], ['DOGEUSDT'], ['']] as const)(
      'rejects truly unsupported instrument %j',
      (raw) => {
        expect(isKnownSymbol(raw)).toBe(false);
        expect(SymbolSchema.safeParse(raw).success).toBe(false);
      },
    );
  });

  describe('Timeframe normalization', () => {
    it.each([
      ['1m', '1m'],
      ['1M', '1m'],
      ['M1', '1m'],
      ['1min', '1m'],
      ['5M', '5m'],
      ['M5', '5m'],
      ['15M', '15m'],
      ['M15', '15m'],
      ['1H', '1h'],
      ['H1', '1h'],
      ['1hr', '1h'],
      ['hourly', '1h'],
      ['4H', '4h'],
      ['H4', '4h'],
      ['1D', '1d'],
      ['D1', '1d'],
      ['daily', '1d'],
      ['1W', '1w'],
      ['W1', '1w'],
      ['weekly', '1w'],
    ] as const)(
      'resolves %s -> %s through normalizeTimeframe and TimeframeSchema',
      (raw, canonical) => {
        expect(normalizeTimeframe(raw)).toBe(canonical);
        expect(TimeframeSchema.parse(raw)).toBe(canonical);
      },
    );

    it.each([['2h'], ['monthly'], ['invalid']] as const)('rejects invalid timeframe %s', (raw) => {
      expect(TimeframeSchema.safeParse(raw).success).toBe(false);
    });
  });
});
