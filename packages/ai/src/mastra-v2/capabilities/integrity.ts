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

// Manifest integrity assertion (audit plan §1.11 / P1-21).

import { TOOL_NAMES } from '@kestrel/shared';

import { nativeCanonicalTools } from '../tools/canonical';
import { MASTRA_CAPABILITIES } from './catalog';
import type { MastraCapability, MastraManifestTool } from './types';

/**
 * Capability "tools" that are deliberately not `createTool` registrations.
 * The symbol-research path invokes the cached collector function directly
 * (`collectSymbolResearchPacketCached` in `packets/packet-cache.ts`) instead
 * of going through a Mastra tool, so its id is listed here explicitly. This
 * is the only sanctioned escape hatch — every other declared id must resolve
 * against the native Mastra suite or the legacy `TOOL_NAMES` registry.
 */
const DIRECT_ADAPTER_TOOL_IDS = new Set<string>(['collect-symbol-research-packet']);

/**
 * Assert the capability manifests stay internally consistent and enforceable.
 * Declared tools must resolve to a real registration (the native Mastra suite,
 * the legacy `TOOL_NAMES` registry, or the direct-adapter list) — a phantom
 * name fails loudly instead of silently passing (audit plan §1.11 / P1-21).
 */
export function assertCapabilityManifestIntegrity(
  capabilities: Record<string, MastraCapability> = MASTRA_CAPABILITIES,
): void {
  const knownLegacyTools = new Set<string>(TOOL_NAMES);
  let registeredMastraToolIds: Set<string>;
  try {
    registeredMastraToolIds = new Set(Object.keys(nativeCanonicalTools()));
  } catch {
    // Tool modules transitively import this manifest (telemetry → tracing →
    // capabilities). When this assertion runs during that ESM cycle the tool
    // bindings can still be uninitialised; defer to the explicit call sites
    // (tests / boot) instead of reporting a phantom-tool error.
    return;
  }
  const resolvesToRegisteredTool = (tool: string): boolean =>
    registeredMastraToolIds.has(tool) || DIRECT_ADAPTER_TOOL_IDS.has(tool);

  for (const [id, capability] of Object.entries(capabilities)) {
    if (id !== capability.id) throw new Error(`Capability manifest ID mismatch: ${id}.`);
    for (const tool of capability.tools) {
      if (!knownLegacyTools.has(tool) && !resolvesToRegisteredTool(tool)) {
        throw new Error(
          `Capability ${id} declares tool "${tool}", which does not resolve to any registered tool.`,
        );
      }
    }
    if (new Set(capability.tools).size !== capability.tools.length) {
      throw new Error(`Capability ${id} declares duplicate tools.`);
    }
    const metadataNames = capability.toolMetadata.map((tool) => tool.name);
    if (
      metadataNames.length !== capability.tools.length ||
      metadataNames.some((name, index) => name !== capability.tools[index])
    ) {
      throw new Error(`Capability ${id} tool metadata is out of sync.`);
    }
    if (
      capability.readOnly &&
      capability.toolMetadata.some(
        (tool) =>
          (tool as MastraManifestTool).access === 'write' ||
          (tool as MastraManifestTool).category === 'mutation',
      )
    ) {
      throw new Error(`Read-only capability ${id} declares a mutation tool.`);
    }
    if (capability.requiresConfirmation && capability.readOnly) {
      throw new Error(`Read-only capability ${id} cannot require mutation confirmation.`);
    }
  }
}

assertCapabilityManifestIntegrity();
