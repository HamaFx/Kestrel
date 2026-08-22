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

import { tryGetSymbolDefinition, type Timeframe } from '@kestrel/shared';

const TO_BINANCE_INTERVAL: Record<Timeframe, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d',
  '1w': '1w',
};

export function toBinanceInterval(tf: Timeframe): string {
  return TO_BINANCE_INTERVAL[tf];
}

/**
 * Binance eligibility comes exclusively from the shared catalog. This keeps
 * unsupported aliases and unlisted exchange pairs out of the data boundary.
 */
export function isCryptoSymbol(symbol: string): boolean {
  const definition = tryGetSymbolDefinition(symbol.trim().toUpperCase());
  return definition?.category === 'crypto' && definition.binance !== null;
}
