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

// Symbol catalog barrel — the single source of truth for the 18 instruments
// supported by the gold, forex, and crypto product surface. Category data,
// types, and lookup helpers live in the `./symbol-catalog/` folder.

export {
  BUILTIN_SYMBOLS,
  SYMBOL_MAP,
  normalizeSymbol,
  isKnownSymbol,
  getSymbolDefinition,
  tryGetSymbolDefinition,
  ALL_SYMBOLS,
  DEFAULT_WATCHLIST_SYMBOLS,
  DEFAULT_STREAM_SYMBOLS,
  CFTC_SUPPORTED_SYMBOLS,
  assertSymbolCatalog,
  symbolsByCategory,
  symbolCategory,
  assetClassForSymbol,
  PROMPT_SYMBOL_PATTERNS,
  extractSymbolsFromText,
} from './symbol-catalog/catalog';
export type { SymbolAssetClass } from './symbol-catalog/catalog';
export type {
  SymbolCapabilities,
  SymbolCategory,
  SymbolDataProvider,
  SymbolDefinition,
  SymbolPriceDistanceUnit,
  SymbolQuantityUnit,
  SymbolQuoteCurrency,
  SymbolSettlementCurrency,
} from './symbol-catalog/types';
