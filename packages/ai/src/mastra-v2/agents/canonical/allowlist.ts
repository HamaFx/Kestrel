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

// Fail-closed canonical read-only tool allowlist.

import { manifestToolNames } from '../../capabilities';
import { resolveNativeCanonicalTool } from '../../tools/canonical';

export const CANONICAL_READ_ONLY_TOOL_NAMES: readonly string[] = Object.freeze([
  ...manifestToolNames('canonical-chat'),
]);

export const READ_ONLY_TOOL_NAMES = new Set<string>(CANONICAL_READ_ONLY_TOOL_NAMES);

/**
 * Fail at module init when the manifest names a tool the native Mastra suite
 * cannot resolve. Phase 4 Task 2: every read-only tool is a native
 * registration, so the native map is the only source the allowlist needs.
 */
export function assertCanonicalToolAllowlist(): void {
  const missing = CANONICAL_READ_ONLY_TOOL_NAMES.filter(
    (name) => resolveNativeCanonicalTool(name) === null,
  );
  if (missing.length > 0) {
    throw new Error(
      `Canonical read-only allowlist references unregistered tools: ${missing.join(', ')}`,
    );
  }
}
