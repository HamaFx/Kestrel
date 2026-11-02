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

import {
  CANONICAL_PUBLIC_READ_ONLY_TOOL_NAMES,
  SENSITIVE_USER_READ_TOOL_NAMES,
} from '../../capabilities';
import { resolveNativeCanonicalTool } from '../../tools/canonical';

/**
 * Tools every canonical chat turn may use: public market data plus the two
 * public chart-analysis tools.
 */
export const CANONICAL_PUBLIC_READ_ONLY_SET: ReadonlySet<string> = new Set<string>(
  CANONICAL_PUBLIC_READ_ONLY_TOOL_NAMES,
);

/**
 * Every read-only tool the canonical agent can ever use. The sensitive
 * user-scoped reads are part of the native suite and are granted only when the
 * turn is a user-data read (`isUserDataReadIntent`), so the capability
 * manifest and the runtime tool belt stay consistent.
 */
export const CANONICAL_READ_ONLY_TOOL_NAMES: readonly string[] = Object.freeze([
  ...new Set<string>([...CANONICAL_PUBLIC_READ_ONLY_TOOL_NAMES, ...SENSITIVE_USER_READ_TOOL_NAMES]),
]);

export const READ_ONLY_TOOL_NAMES = new Set<string>(CANONICAL_READ_ONLY_TOOL_NAMES);

/**
 * Fail at module init when the allowlist names a tool the native Mastra suite
 * cannot resolve. Every read-only tool is a native registration, so the native
 * map is the only source the allowlist needs.
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
