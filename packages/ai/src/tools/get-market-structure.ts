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

// Tool: get_market_structure.
//
// I-03 (audit 2026-10-18) — the implementation moved to the native Mastra
// registration in `mastra-v2/tools/canonical/market-structure.ts`. This module
// is now the AI SDK shim for non-Mastra consumers for one release: it
// re-exports the same schema/description/pure projection and delegates to the
// shared execute core, so both paths always produce identical output.

import type { GetMarketStructureOutput } from '@kestrel/shared';
import { tool, type Tool } from 'ai';
import type { z } from 'zod';

import {
  CANONICAL_MARKET_STRUCTURE_DESCRIPTION,
  CanonicalMarketStructureInputSchema,
  executeCanonicalMarketStructure,
} from '../mastra-v2/tools/canonical/market-structure';

// One-release compatibility re-export: the XAUUSD market-structure tool and
// other consumers import the pure projection from this historical path.
export { computeMarketStructureOutput } from '../mastra-v2/tools/canonical/market-structure';

declare module '@kestrel/shared' {
  interface ToolIOMap {
    get_market_structure: { input: z.infer<typeof CanonicalMarketStructureInputSchema> };
  }
}

export const getMarketStructureTool: Tool<
  z.infer<typeof CanonicalMarketStructureInputSchema>,
  GetMarketStructureOutput
> = tool({
  description: CANONICAL_MARKET_STRUCTURE_DESCRIPTION,
  inputSchema: CanonicalMarketStructureInputSchema,
  execute: async (
    input,
    options?: { abortSignal?: AbortSignal },
  ): Promise<GetMarketStructureOutput> =>
    executeCanonicalMarketStructure(input, options?.abortSignal),
});
