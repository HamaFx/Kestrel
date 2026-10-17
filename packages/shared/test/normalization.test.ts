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
    it('normalizes common natural language and exchange aliases to canonical symbols', () => {
      expect(normalizeSymbol('Gold')).toBe('XAUUSD');
      expect(normalizeSymbol('gold')).toBe('XAUUSD');
      expect(normalizeSymbol('XAU/USD')).toBe('XAUUSD');
      expect(normalizeSymbol('XAU_USD')).toBe('XAUUSD');
      expect(normalizeSymbol('OANDA:XAU_USD')).toBe('XAUUSD');
      expect(normalizeSymbol('SPOT:GOLD')).toBe('XAUUSD');

      expect(normalizeSymbol('EUR/USD')).toBe('EURUSD');
      expect(normalizeSymbol('FX:EUR_USD')).toBe('EURUSD');
      expect(normalizeSymbol('Cable')).toBe('GBPUSD');
      expect(normalizeSymbol('Fibre')).toBe('EURUSD');
      expect(normalizeSymbol('USD/JPY')).toBe('USDJPY');

      expect(normalizeSymbol('BTC')).toBe('BTCUSDT');
      expect(normalizeSymbol('BTCUSD')).toBe('BTCUSDT');
      expect(normalizeSymbol('BTC/USD')).toBe('BTCUSDT');
      expect(normalizeSymbol('Bitcoin')).toBe('BTCUSDT');
      expect(normalizeSymbol('BINANCE:BTCUSDT')).toBe('BTCUSDT');
      expect(normalizeSymbol('ETH')).toBe('ETHUSDT');
      expect(normalizeSymbol('ETH/USD')).toBe('ETHUSDT');
      expect(normalizeSymbol('Ethereum')).toBe('ETHUSDT');
      expect(normalizeSymbol('SOL')).toBe('SOLUSDT');
      expect(normalizeSymbol('SOL/USD')).toBe('SOLUSDT');
      expect(normalizeSymbol('BNB')).toBe('BNBUSDT');
      expect(normalizeSymbol('XRP')).toBe('XRPUSDT');
      expect(normalizeSymbol('ADA')).toBe('ADAUSDT');
    });

    it('SymbolSchema successfully parses aliases', () => {
      expect(SymbolSchema.parse('BTCUSD')).toBe('BTCUSDT');
      expect(SymbolSchema.parse('btc/usd')).toBe('BTCUSDT');
      expect(SymbolSchema.parse('Gold')).toBe('XAUUSD');
      expect(SymbolSchema.parse('EUR/USD')).toBe('EURUSD');
      expect(SymbolSchema.parse('Cable')).toBe('GBPUSD');
    });

    it('isKnownSymbol returns true for aliases', () => {
      expect(isKnownSymbol('BTCUSD')).toBe(true);
      expect(isKnownSymbol('Gold')).toBe(true);
      expect(isKnownSymbol('EUR/USD')).toBe(true);
    });

    it('still rejects truly unsupported instruments', () => {
      expect(isKnownSymbol('US100')).toBe(false);
      expect(isKnownSymbol('XAGUSD')).toBe(false);
      expect(isKnownSymbol('DOGEUSDT')).toBe(false);
      expect(SymbolSchema.safeParse('US100').success).toBe(false);
      expect(SymbolSchema.safeParse('XAGUSD').success).toBe(false);
    });
  });

  describe('Timeframe normalization', () => {
    it('normalizes uppercase and TradingView/MT4 timeframe strings', () => {
      expect(normalizeTimeframe('1m')).toBe('1m');
      expect(normalizeTimeframe('1M')).toBe('1m');
      expect(normalizeTimeframe('M1')).toBe('1m');
      expect(normalizeTimeframe('1min')).toBe('1m');

      expect(normalizeTimeframe('5M')).toBe('5m');
      expect(normalizeTimeframe('M5')).toBe('5m');

      expect(normalizeTimeframe('15M')).toBe('15m');
      expect(normalizeTimeframe('M15')).toBe('15m');

      expect(normalizeTimeframe('1H')).toBe('1h');
      expect(normalizeTimeframe('H1')).toBe('1h');
      expect(normalizeTimeframe('1hr')).toBe('1h');
      expect(normalizeTimeframe('hourly')).toBe('1h');

      expect(normalizeTimeframe('4H')).toBe('4h');
      expect(normalizeTimeframe('H4')).toBe('4h');

      expect(normalizeTimeframe('1D')).toBe('1d');
      expect(normalizeTimeframe('D1')).toBe('1d');
      expect(normalizeTimeframe('daily')).toBe('1d');

      expect(normalizeTimeframe('1W')).toBe('1w');
      expect(normalizeTimeframe('W1')).toBe('1w');
      expect(normalizeTimeframe('weekly')).toBe('1w');
    });

    it('TimeframeSchema transforms and accepts uppercase and MT4 aliases', () => {
      expect(TimeframeSchema.parse('1D')).toBe('1d');
      expect(TimeframeSchema.parse('4H')).toBe('4h');
      expect(TimeframeSchema.parse('1H')).toBe('1h');
      expect(TimeframeSchema.parse('H4')).toBe('4h');
      expect(TimeframeSchema.parse('15M')).toBe('15m');
      expect(TimeframeSchema.parse('daily')).toBe('1d');
    });

    it('TimeframeSchema rejects invalid timeframes', () => {
      expect(TimeframeSchema.safeParse('2h').success).toBe(false);
      expect(TimeframeSchema.safeParse('monthly').success).toBe(false);
      expect(TimeframeSchema.safeParse('invalid').success).toBe(false);
    });
  });
});
