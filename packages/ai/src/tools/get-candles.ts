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

// Tool: get_candles.
//
// B-01 (audit 2026-10-18, I-03) — the implementation moved to the native
// Mastra registration in `mastra-v2/tools/canonical/candles.ts`. This module
// is now the AI SDK shim for non-Mastra consumers for one release: it
// re-exports the same schemas/description and delegates to the shared execute
// core, so both paths always produce identical output.

import type { GetCandlesOutput } from '@kestrel/shared';
import { tool, type Tool } from 'ai';

import {
  executeCanonicalCandles,
  type CanonicalCandlesInput,
} from '../mastra-v2/tools/canonical/candles';
import { CANONICAL_CANDLES_DESCRIPTION } from '../mastra-v2/tools/canonical/descriptions';
import { CanonicalCandlesInputSchema } from '../mastra-v2/tools/canonical/input-schemas';
import { maybeGetToolContext } from '../runtime/tool-context';

declare module '@kestrel/shared' {
  interface ToolIOMap {
    get_candles: { input: CanonicalCandlesInput };
  }
}

export const getCandlesTool: Tool<CanonicalCandlesInput, GetCandlesOutput> = tool({
  description: CANONICAL_CANDLES_DESCRIPTION,
  inputSchema: CanonicalCandlesInputSchema,
  execute: async (input, options?: { abortSignal?: AbortSignal }): Promise<GetCandlesOutput> =>
    executeCanonicalCandles(
      input,
      options?.abortSignal ?? maybeGetToolContext()?.signal ?? undefined,
    ),
});
