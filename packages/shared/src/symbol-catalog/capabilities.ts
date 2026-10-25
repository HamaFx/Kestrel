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

// Capability presets shared by the built-in symbol definitions.

import type { SymbolCapabilities } from './types';

export const FX_CAPABILITIES: SymbolCapabilities = {
  quantityUnit: 'lots',
  contractSize: 100_000,
  priceDistanceUnit: 'pips',
  supportsCftc: false,
  supportsEconomicCalendar: true,
  supportsIntermarket: true,
  supportsSocialSentiment: true,
};

export const CFTC_FX_CAPABILITIES: SymbolCapabilities = {
  ...FX_CAPABILITIES,
  supportsCftc: true,
};

export const GOLD_CAPABILITIES: SymbolCapabilities = {
  quantityUnit: 'ounces',
  contractSize: 100,
  priceDistanceUnit: 'pips',
  supportsCftc: true,
  supportsEconomicCalendar: true,
  supportsIntermarket: true,
  supportsSocialSentiment: true,
};

export const CRYPTO_CAPABILITIES: SymbolCapabilities = {
  quantityUnit: 'coins',
  contractSize: 1,
  priceDistanceUnit: 'price',
  supportsCftc: false,
  supportsEconomicCalendar: false,
  supportsIntermarket: false,
  supportsSocialSentiment: true,
};

/** Built-in symbols always available without a database lookup. */
