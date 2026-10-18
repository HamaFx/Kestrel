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

// Tool: get_cot.
//
// I-03 (audit 2026-10-18) — the implementation moved to the native Mastra
// registration in `mastra-v2/tools/canonical/cot.ts`. This module is now the
// AI SDK shim for non-Mastra consumers for one release: it re-exports the
// same schema/description and delegates to the shared execute core, so both
// paths always produce identical output.

import type { GetCoTOutput } from '@kestrel/shared';
import { tool, type Tool } from 'ai';
import type { z } from 'zod';

import {
  CANONICAL_COT_DESCRIPTION,
  CanonicalCoTInputSchema,
  executeCanonicalCoT,
} from '../mastra-v2/tools/canonical/cot';

declare module '@kestrel/shared' {
  interface ToolIOMap {
    get_cot: { input: z.infer<typeof CanonicalCoTInputSchema> };
  }
}

export const getCoTTool: Tool<z.infer<typeof CanonicalCoTInputSchema>, GetCoTOutput> = tool({
  description: CANONICAL_COT_DESCRIPTION,
  inputSchema: CanonicalCoTInputSchema,
  execute: async (input): Promise<GetCoTOutput> => executeCanonicalCoT(input),
});
