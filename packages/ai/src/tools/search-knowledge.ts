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

// Tool: search_knowledge.
//
// B-01 (audit 2026-10-18, I-03) — the implementation moved to the native
// Mastra registration in `mastra-v2/tools/canonical/knowledge.ts`. This
// module is now the AI SDK shim for non-Mastra consumers for one release: it
// re-exports the same schemas/description and delegates to the shared execute
// core, so both paths always produce identical output.

import type { SearchKnowledgeOutput } from '@kestrel/shared';
import { tool, type Tool } from 'ai';

import { CANONICAL_KNOWLEDGE_DESCRIPTION } from '../mastra-v2/tools/canonical/descriptions';
import { CanonicalKnowledgeInputSchema } from '../mastra-v2/tools/canonical/input-schemas';
import {
  executeCanonicalKnowledge,
  type CanonicalKnowledgeInput,
} from '../mastra-v2/tools/canonical/knowledge';

declare module '@kestrel/shared' {
  interface ToolIOMap {
    search_knowledge: { input: CanonicalKnowledgeInput };
  }
}

export const searchKnowledgeTool: Tool<CanonicalKnowledgeInput, SearchKnowledgeOutput> = tool({
  description: CANONICAL_KNOWLEDGE_DESCRIPTION,
  inputSchema: CanonicalKnowledgeInputSchema,
  execute: async (input): Promise<SearchKnowledgeOutput> => executeCanonicalKnowledge(input),
});
