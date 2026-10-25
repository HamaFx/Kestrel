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

// Symbol catalog — the single source of truth for the 18 instruments that
// are supported by the first-class gold, forex, and crypto product surface.
//
// The database `symbol_catalog` table mirrors this metadata for activation,
// ordering, and user visibility. It does not define new instrument metadata;
// runtime-extensible symbols can be added in a later, explicit migration.

// Built-in crypto symbol definitions.

import { CRYPTO_CAPABILITIES } from './capabilities';
import type { SymbolDefinition } from './types';

export const CRYPTO_SYMBOLS: SymbolDefinition[] = [
  {
    internal: 'BTCUSDT',
    display: 'Bitcoin / Tether',
    category: 'crypto',
    baseCurrency: 'BTC',
    quoteCurrency: 'USDT',
    settlementCurrency: 'USDT',
    biquote: null,
    binance: 'BTCUSDT',
    finnhub: 'BINANCE:BTCUSDT',
    tradingView: 'BINANCE:BTCUSDT',
    decimals: 2,
    pipSize: 0.01,
    currencies: ['USD', 'USDT', 'BTC'],
    providers: ['binance', 'finnhub'],
    capabilities: { ...CRYPTO_CAPABILITIES },
  },
  {
    internal: 'ETHUSDT',
    display: 'Ethereum / Tether',
    category: 'crypto',
    baseCurrency: 'ETH',
    quoteCurrency: 'USDT',
    settlementCurrency: 'USDT',
    biquote: null,
    binance: 'ETHUSDT',
    finnhub: 'BINANCE:ETHUSDT',
    tradingView: 'BINANCE:ETHUSDT',
    decimals: 2,
    pipSize: 0.01,
    currencies: ['USD', 'USDT', 'ETH'],
    providers: ['binance', 'finnhub'],
    capabilities: { ...CRYPTO_CAPABILITIES },
  },
  {
    internal: 'SOLUSDT',
    display: 'Solana / Tether',
    category: 'crypto',
    baseCurrency: 'SOL',
    quoteCurrency: 'USDT',
    settlementCurrency: 'USDT',
    biquote: null,
    binance: 'SOLUSDT',
    finnhub: 'BINANCE:SOLUSDT',
    tradingView: 'BINANCE:SOLUSDT',
    decimals: 2,
    pipSize: 0.01,
    currencies: ['USD', 'USDT', 'SOL'],
    providers: ['binance', 'finnhub'],
    capabilities: { ...CRYPTO_CAPABILITIES },
  },
  {
    internal: 'BNBUSDT',
    display: 'BNB / Tether',
    category: 'crypto',
    baseCurrency: 'BNB',
    quoteCurrency: 'USDT',
    settlementCurrency: 'USDT',
    biquote: null,
    binance: 'BNBUSDT',
    finnhub: 'BINANCE:BNBUSDT',
    tradingView: 'BINANCE:BNBUSDT',
    decimals: 2,
    pipSize: 0.01,
    currencies: ['USD', 'USDT', 'BNB'],
    providers: ['binance', 'finnhub'],
    capabilities: { ...CRYPTO_CAPABILITIES },
  },
  {
    internal: 'XRPUSDT',
    display: 'XRP / Tether',
    category: 'crypto',
    baseCurrency: 'XRP',
    quoteCurrency: 'USDT',
    settlementCurrency: 'USDT',
    biquote: null,
    binance: 'XRPUSDT',
    finnhub: 'BINANCE:XRPUSDT',
    tradingView: 'BINANCE:XRPUSDT',
    decimals: 4,
    pipSize: 0.0001,
    currencies: ['USD', 'USDT', 'XRP'],
    providers: ['binance', 'finnhub'],
    capabilities: { ...CRYPTO_CAPABILITIES },
  },
  {
    internal: 'ADAUSDT',
    display: 'Cardano / Tether',
    category: 'crypto',
    baseCurrency: 'ADA',
    quoteCurrency: 'USDT',
    settlementCurrency: 'USDT',
    biquote: null,
    binance: 'ADAUSDT',
    finnhub: 'BINANCE:ADAUSDT',
    tradingView: 'BINANCE:ADAUSDT',
    decimals: 4,
    pipSize: 0.0001,
    currencies: ['USD', 'USDT', 'ADA'],
    providers: ['binance', 'finnhub'],
    capabilities: { ...CRYPTO_CAPABILITIES },
  },
];
