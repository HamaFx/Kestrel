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

// SPDX-License-Identifier: Apache-2.0

/**
 * B-01 (audit 2026-10-18, I-03) — native Mastra registration of `get_price`.
 *
 * P2-01 removal: the legacy `tools/get-price.ts` AI SDK shim was deleted, so
 * this execute core is now the only `get_price` implementation.
 */

import { getPrice, priceAgeSeconds, ProviderError } from '@kestrel/data';
import type { GetPriceOutput, QuoteFreshness } from '@kestrel/shared';
import { createTool } from '@mastra/core/tools';
import { type z } from 'zod';

import { maybeGetToolContext } from '@ai/runtime/tool-context';

import { createReadOnlyToolExecute } from '../../agents/xauusd/legacy-tool-adapter';
import { CANONICAL_PRICE_DESCRIPTION } from './descriptions';
import { CanonicalPriceInputSchema } from './input-schemas';

// Leaf re-exports: the values live in modules with no app-graph imports, so a
// module-scope read (legacy shims, other consumers) can never land on a binding
// that is still initialising inside the instance ↔ tools import cycle.
export { CANONICAL_PRICE_DESCRIPTION, CanonicalPriceInputSchema };

export type CanonicalPriceInput = z.infer<typeof CanonicalPriceInputSchema>;

/**
 * Age at which a quote is disclosed as not-live even when no SWR fallback
 * happened. A live FX/gold quote is seconds old; a minute means the provider
 * stopped updating (e.g. market closed) and the model must say so.
 */
export const PRICE_AGE_WARN_SECONDS = 60;

/**
 * Shared execute core: fetches the latest mid price for one or more symbols.
 * Calls into `packages/data` so the cache + provider failover apply
 * transparently — the AI never talks to a provider directly.
 *
 * R8 (audit 2026-10-31): this reads the meta-returning getter so `stale` and
 * the quote age reach the model as output fields it can disclose, instead of
 * being dropped at the adapter boundary.
 */
export async function executeCanonicalPrice(
  input: CanonicalPriceInput,
  signal?: AbortSignal,
): Promise<GetPriceOutput> {
  const effectiveSignal = signal ?? maybeGetToolContext()?.signal ?? undefined;
  const results = await Promise.all(
    input.symbols.map(async (s) => {
      try {
        return await getPrice(s, effectiveSignal ? { signal: effectiveSignal } : {});
      } catch (err) {
        if (err instanceof ProviderError) {
          throw new Error(`Couldn't price ${s}: ${err.message}`, { cause: err });
        }
        throw err;
      }
    }),
  );

  const now = Date.now();
  const freshness: QuoteFreshness[] = results.map((result) => ({
    symbol: result.tick.symbol,
    source: result.tick.source,
    stale: result.stale || result.tick.stale === true,
    producedAt: result.producedAt,
    ageSeconds: priceAgeSeconds(result, now),
  }));

  return {
    ticks: results.map((result) => result.tick),
    asOf: new Date(now).toISOString(),
    freshness,
    warnings: buildFreshnessWarnings(freshness),
  };
}

/**
 * Pre-rendered lines for the model. The canonical system prompt already asks
 * it to disclose stale data; these strings remove any excuse not to, and they
 * are also the values the evidence gate sees in the tool output.
 */
export function buildFreshnessWarnings(freshness: readonly QuoteFreshness[]): string[] {
  const warnings: string[] = [];
  for (const f of freshness) {
    const age = f.ageSeconds === null ? null : Math.round(f.ageSeconds);
    if (f.stale) {
      warnings.push(
        `${f.symbol}: the quote was served from a stale cache after an upstream failure${
          age === null ? '' : ` (age ${age}s)`
        } — do not present it as a live price.`,
      );
    } else if (age !== null && age > PRICE_AGE_WARN_SECONDS) {
      warnings.push(
        `${f.symbol}: the quote is ${age}s old (source ${f.source}) — disclose that it is not live.`,
      );
    }
  }
  return warnings;
}

export const canonicalPriceTool = createTool({
  id: 'kestrel-get_price',
  description: CANONICAL_PRICE_DESCRIPTION,
  inputSchema: CanonicalPriceInputSchema,
  execute: createReadOnlyToolExecute<CanonicalPriceInput, GetPriceOutput>(
    'kestrel-get_price',
    'get_price',
    (input, context) => executeCanonicalPrice(input, context.abortSignal),
  ),
});
