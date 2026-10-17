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

import { extractSymbolsFromText } from '../src';

describe('extractSymbolsFromText (F-02)', () => {
  it('extracts natural language symbols correctly', () => {
    expect(extractSymbolsFromText('Analyze Bitcoin structure')).toEqual(['BTCUSDT']);
    expect(extractSymbolsFromText('What is BTC doing today?')).toEqual(['BTCUSDT']);
    expect(extractSymbolsFromText('Gold looks ready to break 2500')).toEqual(['XAUUSD']);
    expect(extractSymbolsFromText('Run committee on Cable')).toEqual(['GBPUSD']);
    expect(extractSymbolsFromText('Fiber momentum is fading')).toEqual(['EURUSD']);
    expect(extractSymbolsFromText('Check Ethereum on 4h')).toEqual(['ETHUSDT']);
    expect(extractSymbolsFromText('Solana weekly trend')).toEqual(['SOLUSDT']);
  });

  it('extracts slashed and exchange-prefixed pairs', () => {
    expect(extractSymbolsFromText('What is BTC/USD doing?')).toEqual(['BTCUSDT']);
    expect(extractSymbolsFromText('Check EUR/USD on 4h')).toEqual(['EURUSD']);
    expect(extractSymbolsFromText('Look at BINANCE:BTCUSDT')).toEqual(['BTCUSDT']);
    expect(extractSymbolsFromText('Check OANDA:XAUUSD')).toEqual(['XAUUSD']);
  });

  it('extracts multiple symbols when present', () => {
    const symbols = extractSymbolsFromText('Compare Gold and Bitcoin');
    expect(symbols).toContain('XAUUSD');
    expect(symbols).toContain('BTCUSDT');
    expect(symbols).toHaveLength(2);
  });

  it('returns empty array when no symbol is mentioned', () => {
    expect(extractSymbolsFromText('Hello there how are you?')).toEqual([]);
    expect(extractSymbolsFromText('What is market structure?')).toEqual([]);
  });
});
