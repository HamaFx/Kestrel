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

// Serialisable types for the symbol catalog.

export type SymbolCategory = 'gold' | 'forex' | 'crypto';
export type SymbolDataProvider = 'biquote' | 'binance' | 'finnhub';
export type SymbolQuantityUnit = 'lots' | 'ounces' | 'coins';
export type SymbolPriceDistanceUnit = 'pips' | 'price';
export type SymbolSettlementCurrency = 'USD' | 'USDT';
/** @deprecated Use SymbolSettlementCurrency. */
export type SymbolQuoteCurrency = SymbolSettlementCurrency;

export interface SymbolCapabilities {
  /** Position sizing unit used by risk calculations. */
  readonly quantityUnit: SymbolQuantityUnit;
  /** Units represented by one standard lot, or one coin for crypto. */
  readonly contractSize: number;
  /** Whether price distances should be presented as pips or raw price. */
  readonly priceDistanceUnit: SymbolPriceDistanceUnit;
  /** Whether the CFTC Commitment-of-Traders pipeline applies. */
  readonly supportsCftc: boolean;
  /** Whether the economic-calendar pipeline has direct symbol relevance. */
  readonly supportsEconomicCalendar: boolean;
  /** Whether the current intermarket feature set applies. */
  readonly supportsIntermarket: boolean;
  /** Whether social/news sentiment is meaningful for the instrument. */
  readonly supportsSocialSentiment: boolean;
}

export interface SymbolDefinition {
  /** Internal canonical symbol, e.g. "XAUUSD", "EURUSD", "BTCUSDT" */
  readonly internal: string;
  /** Display name */
  readonly display: string;
  /** Asset category */
  readonly category: SymbolCategory;
  /** Base asset/currency */
  readonly baseCurrency: string;
  /** Quote currency (e.g. JPY for USDJPY, USDT for crypto). */
  readonly quoteCurrency: string;
  /** Settlement currency used for account/risk display. */
  readonly settlementCurrency: SymbolSettlementCurrency;
  /** BiQuote symbol format, or null when BiQuote is not applicable. */
  readonly biquote: string | null;
  /** Binance symbol format, or null for non-crypto instruments. */
  readonly binance: string | null;
  /** Finnhub symbol format (for fallback). */
  readonly finnhub: string;
  /** TradingView symbol format. */
  readonly tradingView: string;
  /** Price decimals. */
  readonly decimals: number;
  /** Legacy pip/price-step field retained for formatting compatibility. */
  readonly pipSize: number;
  /** Currency/asset tags used for news filtering. */
  readonly currencies: readonly string[];
  /** Upstream providers that can serve this instrument. */
  readonly providers: readonly SymbolDataProvider[];
  /** Asset-specific behavior used by later phases. */
  readonly capabilities: SymbolCapabilities;
}
