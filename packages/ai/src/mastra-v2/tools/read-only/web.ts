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

// Phase 4 Task 2 — native Mastra registration for `web_search`. The execute
// core stays in `tools/web-search/`; this registration is the only Mastra
// surface (the capability manifest marks its output untrusted).
//
// Built lazily (see `read-only/index.ts`): reading the legacy tool bindings at
// module scope would race the `instance ↔ tools` import cycle.

import type { WebSearchOutput } from '@kestrel/shared';
import { createTool } from '@mastra/core/tools';

import { webSearchTool } from '@ai/tools/web-search';
import { InputSchema, type SearchInput } from '@ai/tools/web-search/types';
import {
  createReadOnlyToolExecute,
  executeLegacyReadOnlyTool,
  readOnlyToolDescription,
} from '@ai/mastra-v2/tools/tool-lifecycle';

/** Native web-domain read-only tools by registry name. */
export function buildWebReadOnlyTools(): Readonly<Record<string, unknown>> {
  return {
    web_search: createTool({
      id: 'kestrel-web_search',
      description: readOnlyToolDescription(webSearchTool, 'web_search'),
      inputSchema: InputSchema,
      execute: createReadOnlyToolExecute<SearchInput, WebSearchOutput>(
        'kestrel-web_search',
        'web_search',
        (input, context) => executeLegacyReadOnlyTool(webSearchTool, input, context),
      ),
    }),
  };
}
