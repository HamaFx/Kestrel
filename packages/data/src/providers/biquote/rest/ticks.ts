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

// Tick endpoints: single-symbol latest tick and the batched `symbols` query.

import {
  BiquoteLatestResponseSchema,
  BiquoteTickSchema,
  type BiquoteTick,
  type Symbol,
} from '@kestrel/shared';

import { assertSupportedSymbol } from '../filter';
import { toBiquoteSymbol } from '../map';
import { call, type CallOptions } from './call';

/** Latest tick for a single symbol. */
export async function fetchTick(symbol: Symbol, opts: CallOptions = {}): Promise<BiquoteTick> {
  const validated = assertSupportedSymbol(symbol);
  return call(`/api/${toBiquoteSymbol(validated)}`, null, BiquoteTickSchema, opts);
}

const MAX_LATEST_BATCH = 100;

/**
 * Latest ticks for multiple symbols in one HTTP round trip (up to 100 per call).
 * Per BiQuote docs (`https://biquote.io/docs/`), the `symbols` query parameter
 * MUST be repeated (`?symbols=XAUUSD&symbols=EURUSD`); comma-separated lists
 * are not supported. Response is a symbol-keyed object `{ EURUSD: {...} }`
 * (normalized to `BiquoteTick[]` by `BiquoteLatestResponseSchema`).
 */
export async function fetchLatest(
  symbols: Symbol[],
  opts: CallOptions = {},
): Promise<BiquoteTick[]> {
  if (symbols.length === 0) return [];
  const validated = [...new Set(symbols.map((s) => toBiquoteSymbol(assertSupportedSymbol(s))))];
  const out: BiquoteTick[] = [];
  for (let i = 0; i < validated.length; i += MAX_LATEST_BATCH) {
    const chunk = validated.slice(i, i + MAX_LATEST_BATCH);
    const ticks = await call('/api/latest', { symbols: chunk }, BiquoteLatestResponseSchema, opts);
    out.push(...ticks);
  }
  return out;
}
