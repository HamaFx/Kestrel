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

// Tool: get_price.
//
// B-01 (audit 2026-10-18, I-03) — the implementation moved to the native
// Mastra registration in `mastra-v2/tools/canonical/price.ts`. This module is
// now the AI SDK shim for non-Mastra consumers for one release: it re-exports
// the same schemas/description and delegates to the shared execute core, so
// both paths always produce identical output.

import type { GetPriceOutput } from '@kestrel/shared';
import { tool, type Tool } from 'ai';

import { CANONICAL_PRICE_DESCRIPTION } from '../mastra-v2/tools/canonical/descriptions';
import { CanonicalPriceInputSchema } from '../mastra-v2/tools/canonical/input-schemas';
import {
  executeCanonicalPrice,
  type CanonicalPriceInput,
} from '../mastra-v2/tools/canonical/price';
import { maybeGetToolContext } from '../runtime/tool-context';

// Module-augment the shared ToolIOMap so consumers get strongly-typed inputs
// by tool name. Outputs are sourced centrally from `ToolOutputMap` in
// `@shared/ai/tool-io` (driven by the per-tool zod schemas in
// `@shared/schemas/tool-outputs/`), so we don't redeclare them here.
declare module '@kestrel/shared' {
  interface ToolIOMap {
    get_price: { input: CanonicalPriceInput };
  }
}

export const getPriceTool: Tool<CanonicalPriceInput, GetPriceOutput> = tool({
  description: CANONICAL_PRICE_DESCRIPTION,
  inputSchema: CanonicalPriceInputSchema,
  execute: async (input, options?: { abortSignal?: AbortSignal }): Promise<GetPriceOutput> =>
    executeCanonicalPrice(
      input,
      options?.abortSignal ?? maybeGetToolContext()?.signal ?? undefined,
    ),
});
