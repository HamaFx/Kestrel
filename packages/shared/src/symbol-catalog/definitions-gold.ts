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

// Built-in gold symbol definitions.

import { GOLD_CAPABILITIES } from './capabilities';
import type { SymbolDefinition } from './types';

export const GOLD_SYMBOLS: SymbolDefinition[] = [
  {
    internal: 'XAUUSD',
    display: 'Gold / US Dollar',
    category: 'gold',
    baseCurrency: 'XAU',
    quoteCurrency: 'USD',
    settlementCurrency: 'USD',
    biquote: 'XAUUSD',
    binance: null,
    finnhub: 'OANDA:XAU_USD',
    tradingView: 'OANDA:XAUUSD',
    decimals: 2,
    pipSize: 0.1,
    currencies: ['USD', 'XAU'],
    providers: ['biquote', 'finnhub'],
    capabilities: { ...GOLD_CAPABILITIES },
  },
];
