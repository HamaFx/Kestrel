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
 * The execute core moved here from `tools/get-price.ts`; the legacy module is
 * now a thin AI SDK shim over the same core, so the canonical Mastra agent
 * runs a genuine `createTool` registration while every non-Mastra consumer
 * keeps the identical output shape.
 */

import { getPrice, ProviderError } from '@kestrel/data';
import { ALL_SYMBOLS, SymbolSchema, type GetPriceOutput } from '@kestrel/shared';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { maybeGetToolContext } from '@ai/tool-context';
import { createReadOnlyToolExecute } from '../../agents/xauusd/legacy-tool-adapter';

export const CanonicalPriceInputSchema = z.object({
  symbols: z.array(SymbolSchema).min(1).max(ALL_SYMBOLS.length),
});

export type CanonicalPriceInput = z.infer<typeof CanonicalPriceInputSchema>;

export const CANONICAL_PRICE_DESCRIPTION =
  'Fetch the most recent mid price for one or more symbols supported by the canonical gold, forex, and crypto catalog. Use only when the LIVE_SNAPSHOT in the system prompt is missing the symbol or older than 10 seconds.';

/**
 * Shared execute core: fetches the latest mid price for one or more symbols.
 * Calls into `packages/data` so the cache + provider failover apply
 * transparently — the AI never talks to a provider directly.
 */
export async function executeCanonicalPrice(
  input: CanonicalPriceInput,
  signal?: AbortSignal,
): Promise<GetPriceOutput> {
  const effectiveSignal = signal ?? maybeGetToolContext()?.signal ?? undefined;
  const ticks = await Promise.all(
    input.symbols.map(async (s) => {
      try {
        return await (effectiveSignal ? getPrice(s, { signal: effectiveSignal }) : getPrice(s));
      } catch (err) {
        if (err instanceof ProviderError) {
          throw new Error(`Couldn't price ${s}: ${err.message}`, { cause: err });
        }
        throw err;
      }
    }),
  );
  return { ticks, asOf: new Date().toISOString() };
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
