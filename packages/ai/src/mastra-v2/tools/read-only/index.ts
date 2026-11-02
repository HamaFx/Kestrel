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

// Phase 4 Task 2 — the native Mastra registrations for every remaining
// read-only Kestrel tool. Each group builds `createTool` registrations that
// wrap the existing deterministic execute core in `tools/*`.
//
// The map (and therefore every legacy-binding read) is built on first use:
// this module sits inside the `instance ↔ tools` import cycle, so eager reads
// would surface a TDZ ReferenceError during cyclic evaluation.

import { buildAnalysisReadOnlyTools } from './analysis';
import { buildMarketReadOnlyTools } from './market';
import { buildSystemReadOnlyTools } from './system';
import { buildUserDataReadOnlyTools } from './user-data';
import { buildWebReadOnlyTools } from './web';

let nativeReadOnlyToolsCache: Readonly<Record<string, unknown>> | null = null;

/**
 * Every remaining read-only tool by its legacy registry name (the key the
 * capability manifest, the agent domain tool filter, and the specialist desks
 * use). The seven canonical market tools live in `tools/canonical/*`.
 */
export function nativeReadOnlyTools(): Readonly<Record<string, unknown>> {
  nativeReadOnlyToolsCache ??= {
    ...buildMarketReadOnlyTools(),
    ...buildAnalysisReadOnlyTools(),
    ...buildUserDataReadOnlyTools(),
    ...buildSystemReadOnlyTools(),
    ...buildWebReadOnlyTools(),
  };
  return nativeReadOnlyToolsCache;
}
