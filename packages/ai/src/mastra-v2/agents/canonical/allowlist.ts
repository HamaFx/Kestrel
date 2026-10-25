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

import { registerAllTools, toolRegistry } from '@ai/tools';

import { manifestToolNames } from '../../capabilities';
import { resolveNativeCanonicalTool } from '../../tools/canonical';

export const CANONICAL_READ_ONLY_TOOL_NAMES: readonly string[] = Object.freeze([
  ...manifestToolNames('canonical-chat'),
]);

export const READ_ONLY_TOOL_NAMES = new Set<string>(CANONICAL_READ_ONLY_TOOL_NAMES);

/**
 * Fail at module init when the manifest names a tool that neither the legacy
 * registry nor a native canonical registration can resolve. P2-01: with the
 * legacy shims disabled (`PHASE_TOOLS_SHIMS=0`) the natively-migrated names
 * are absent from the registry, but the allowlist is still satisfied.
 */
export function assertCanonicalToolAllowlist(): void {
  registerAllTools(toolRegistry);
  const missing = CANONICAL_READ_ONLY_TOOL_NAMES.filter(
    (name) => !toolRegistry.has(name) && !resolveNativeCanonicalTool(name),
  );
  if (missing.length > 0) {
    throw new Error(
      `Canonical read-only allowlist references unregistered tools: ${missing.join(', ')}`,
    );
  }
}
