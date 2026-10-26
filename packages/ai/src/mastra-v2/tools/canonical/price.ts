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
import type { GetPriceOutput } from '@kestrel/shared';
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
