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

// The canonical built-in symbol catalog: category data assembled in one
// place, plus the freeze/lookup/alias helpers that operate on it.

import { CRYPTO_SYMBOLS } from './definitions-crypto';
import { FOREX_SYMBOLS } from './definitions-forex';
import { GOLD_SYMBOLS } from './definitions-gold';
import type { SymbolCategory, SymbolDataProvider, SymbolDefinition } from './types';

const BUILTIN_SYMBOLS_UNFROZEN: SymbolDefinition[] = [
  ...GOLD_SYMBOLS,
  ...FOREX_SYMBOLS,
  ...CRYPTO_SYMBOLS,
];

function freezeSymbolDefinition(definition: SymbolDefinition): SymbolDefinition {
  Object.freeze(definition.capabilities);
  Object.freeze(definition.currencies);
  Object.freeze(definition.providers);
  return Object.freeze(definition);
}

/** Immutable built-in catalog exposed to all package consumers. */
export const BUILTIN_SYMBOLS: readonly SymbolDefinition[] = Object.freeze(
  BUILTIN_SYMBOLS_UNFROZEN.map(freezeSymbolDefinition),
);

/**
 * Read-only Map-compatible lookup surface. The backing map remains a real
 * Map for `instanceof Map` and iteration compatibility, while public mutators
 * throw instead of changing global catalog state.
 */
const SYMBOL_MAP_BACKING = new Map(BUILTIN_SYMBOLS.map((symbol) => [symbol.internal, symbol]));
const readOnlyMapMutation = (): never => {
  throw new Error('The canonical symbol map is read-only');
};

export const SYMBOL_MAP: ReadonlyMap<string, SymbolDefinition> = new Proxy(SYMBOL_MAP_BACKING, {
  get(target, property, _receiver) {
    if (property === 'set' || property === 'delete' || property === 'clear') {
      return readOnlyMapMutation;
    }
    const value = Reflect.get(target, property, target);
    return typeof value === 'function' ? value.bind(target) : value;
  },
});

const SYMBOL_ALIAS_MAP: Readonly<Record<string, string>> = {
  GOLD: 'XAUUSD',
  XAU: 'XAUUSD',
  SPOTGOLD: 'XAUUSD',
  CABLE: 'GBPUSD',
  FIBRE: 'EURUSD',
  FIBER: 'EURUSD',
  BTC: 'BTCUSDT',
  BTCUSD: 'BTCUSDT',
  XBTUSD: 'BTCUSDT',
  XBTUSDT: 'BTCUSDT',
  BITCOIN: 'BTCUSDT',
  ETH: 'ETHUSDT',
  ETHUSD: 'ETHUSDT',
  ETHEREUM: 'ETHUSDT',
  SOL: 'SOLUSDT',
  SOLUSD: 'SOLUSDT',
  SOLANA: 'SOLUSDT',
  BNB: 'BNBUSDT',
  BNBUSD: 'BNBUSDT',
  XRP: 'XRPUSDT',
  XRPUSD: 'XRPUSDT',
  RIPPLE: 'XRPUSDT',
  ADA: 'ADAUSDT',
  ADAUSD: 'ADAUSDT',
  CARDANO: 'ADAUSDT',
};

/** Canonicalize user/provider input and resolve common exchange/natural-language aliases. */
export function normalizeSymbol(symbol: string): string {
  const cleaned = symbol
    .trim()
    .toUpperCase()
    .replace(/^(?:OANDA|BINANCE|FOREX|CRYPTO|FX|SPOT):/, '')
    .replace(/[\s/_-]+/g, '');
  return SYMBOL_ALIAS_MAP[cleaned] ?? cleaned;
}

/** Check if a string is a known canonical symbol (or known alias). */
export function isKnownSymbol(symbol: string): boolean {
  return SYMBOL_MAP.has(normalizeSymbol(symbol));
}

/** Get a symbol definition or throw for an unsupported instrument. */
export function getSymbolDefinition(symbol: string): SymbolDefinition {
  const canonical = normalizeSymbol(symbol);
  const definition = SYMBOL_MAP.get(canonical);
  if (!definition) throw new Error(`Unknown symbol: ${canonical}`);
  return definition;
}

/** Get a symbol definition or null (no throw). */
export function tryGetSymbolDefinition(symbol: string): SymbolDefinition | null {
  return SYMBOL_MAP.get(normalizeSymbol(symbol)) ?? null;
}

/** All 18 canonical built-in symbols. */
export const ALL_SYMBOLS: readonly string[] = Object.freeze(
  BUILTIN_SYMBOLS.map((symbol) => symbol.internal),
);

/** New-user watchlist defaults: gold, major FX, and two liquid crypto pairs. */
export const DEFAULT_WATCHLIST_SYMBOLS = Object.freeze([
  'XAUUSD',
  'EURUSD',
  'GBPUSD',
  'BTCUSDT',
  'ETHUSDT',
] as const);

/** Default active stream set before the database catalog is reconciled. */
export const DEFAULT_STREAM_SYMBOLS = Object.freeze([...ALL_SYMBOLS]);

/** Symbols with a direct CFTC Commitment-of-Traders mapping. */
export const CFTC_SUPPORTED_SYMBOLS = Object.freeze(['XAUUSD', 'EURUSD', 'GBPUSD'] as const);

/** Validate the built-in catalog contract at module initialization and in tests. */
export function assertSymbolCatalog(): void {
  const seen = new Set<string>();
  for (const definition of BUILTIN_SYMBOLS) {
    const canonical = normalizeSymbol(definition.internal);
    if (canonical !== definition.internal || seen.has(definition.internal)) {
      throw new Error(`Invalid or duplicate canonical symbol: ${definition.internal}`);
    }
    seen.add(definition.internal);

    const hasProvider = (provider: SymbolDataProvider) => definition.providers.includes(provider);
    if (definition.category === 'crypto') {
      if (definition.binance === null || !hasProvider('binance') || definition.biquote !== null) {
        throw new Error(`Invalid crypto provider metadata: ${definition.internal}`);
      }
    } else if (
      definition.binance !== null ||
      !hasProvider('biquote') ||
      definition.biquote === null
    ) {
      throw new Error(`Invalid non-crypto provider metadata: ${definition.internal}`);
    }

    const hasCftcMapping = CFTC_SUPPORTED_SYMBOLS.includes(
      definition.internal as (typeof CFTC_SUPPORTED_SYMBOLS)[number],
    );
    if (definition.capabilities.supportsCftc !== hasCftcMapping) {
      throw new Error(`Invalid CFTC capability metadata: ${definition.internal}`);
    }
  }

  const defaults = [
    ...DEFAULT_WATCHLIST_SYMBOLS,
    ...DEFAULT_STREAM_SYMBOLS,
    ...CFTC_SUPPORTED_SYMBOLS,
  ];
  if (defaults.some((symbol) => !seen.has(symbol))) {
    throw new Error('Invalid symbol defaults: every default must be canonical');
  }
}

assertSymbolCatalog();

/** Get all canonical symbols in one asset category. */
export function symbolsByCategory(category: SymbolCategory): string[] {
  return BUILTIN_SYMBOLS.filter((symbol) => symbol.category === category).map(
    (symbol) => symbol.internal,
  );
}

/** Category for a symbol, or null for an unsupported input. */
export function symbolCategory(symbol: string): SymbolCategory | null {
  return tryGetSymbolDefinition(symbol)?.category ?? null;
}

/**
 * C-02 (audit 2026-10-18) — coarse asset-class label for cross-asset
 * telemetry (Langfuse trace metadata, committee execution metrics). The
 * canonical catalog category (`gold` | `forex` | `crypto`) is too coarse to
 * filter by in dashboards, so this maps it onto a stable operator-facing
 * vocabulary.
 */
export type SymbolAssetClass = 'precious' | 'fx-majors' | 'crypto';

export function assetClassForSymbol(symbol: string): SymbolAssetClass | null {
  switch (symbolCategory(symbol)) {
    case 'gold':
      return 'precious';
    case 'forex':
      return 'fx-majors';
    case 'crypto':
      return 'crypto';
    default:
      return null;
  }
}

/**
 * Patterns matching natural-language asset names and nicknames to their canonical internal symbols.
 */
export const PROMPT_SYMBOL_PATTERNS: ReadonlyArray<{
  readonly regex: RegExp;
  readonly canonical: string;
}> = [
  { regex: /\bgold\b/i, canonical: 'XAUUSD' },
  { regex: /\b(?:bitcoin|btc)\b/i, canonical: 'BTCUSDT' },
  { regex: /\b(?:ethereum|ether|eth)\b/i, canonical: 'ETHUSDT' },
  { regex: /\b(?:solana|sol)\b/i, canonical: 'SOLUSDT' },
  { regex: /\bcable\b/i, canonical: 'GBPUSD' },
  { regex: /\b(?:fiber|fibre)\b/i, canonical: 'EURUSD' },
];

/**
 * Extract all recognized symbols mentioned in a natural-language text.
 * Handles canonical tickers, slashed pairs (EUR/USD, BTC/USDT), exchange prefixes (BINANCE:BTCUSDT),
 * and common natural language aliases (Bitcoin, Gold, Cable, Fiber).
 */
export function extractSymbolsFromText(text: string): string[] {
  const matched = new Set<string>();

  // 1. Natural language aliases & nicknames
  for (const { regex, canonical } of PROMPT_SYMBOL_PATTERNS) {
    if (regex.test(text)) {
      matched.add(canonical);
    }
  }

  // 2. Slashed pairs (e.g. EUR/USD, BTC/USD, BTC/USDT)
  const slashedMatches = text.matchAll(/\b([A-Za-z]{3,6})\s*\/\s*([A-Za-z]{3,6})\b/g);
  for (const m of slashedMatches) {
    const raw = `${m[1]}${m[2]}`;
    const norm = normalizeSymbol(raw);
    if (isKnownSymbol(norm)) {
      matched.add(norm);
    }
  }

  // 3. Word tokens (canonical tickers, uppercase aliases, exchange:ticker)
  const wordMatches = text.matchAll(/\b([A-Za-z0-9_:]+)\b/g);
  for (const m of wordMatches) {
    const token = m[1];
    if (!token) continue;
    const upper = token.toUpperCase();
    if (SYMBOL_ALIAS_MAP[upper] || BUILTIN_SYMBOLS.some((s) => s.internal === upper)) {
      const norm = normalizeSymbol(token);
      if (isKnownSymbol(norm)) {
        matched.add(norm);
      }
    } else if (token.includes(':') || token.includes('_')) {
      const norm = normalizeSymbol(token);
      if (isKnownSymbol(norm)) {
        matched.add(norm);
      }
    }
  }

  return [...matched];
}
