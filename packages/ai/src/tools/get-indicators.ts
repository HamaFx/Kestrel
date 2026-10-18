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

// Tool: get_indicators.
//
// B-01 (audit 2026-10-18, I-03) — the implementation moved to the native
// Mastra registration in `mastra-v2/tools/canonical/indicators.ts`. This
// module is now the AI SDK shim for non-Mastra consumers for one release: it
// re-exports the same schemas/description and delegates to the shared execute
// core, so both paths always produce identical output.

import type { GetIndicatorsOutput } from '@kestrel/shared';
import { tool, type Tool } from 'ai';

import {
  CANONICAL_INDICATORS_DESCRIPTION,
  CanonicalIndicatorsInputSchema,
  executeCanonicalIndicators,
  type CanonicalIndicatorsInput,
} from '../mastra-v2/tools/canonical/indicators';
import { maybeGetToolContext } from '../tool-context';

declare module '@kestrel/shared' {
  interface ToolIOMap {
    get_indicators: { input: CanonicalIndicatorsInput };
  }
}

export const getIndicatorsTool: Tool<CanonicalIndicatorsInput, GetIndicatorsOutput> = tool({
  description: CANONICAL_INDICATORS_DESCRIPTION,
  inputSchema: CanonicalIndicatorsInputSchema,
  execute: async (input, options?: { abortSignal?: AbortSignal }): Promise<GetIndicatorsOutput> =>
    executeCanonicalIndicators(
      input,
      options?.abortSignal ?? maybeGetToolContext()?.signal ?? undefined,
    ),
});
