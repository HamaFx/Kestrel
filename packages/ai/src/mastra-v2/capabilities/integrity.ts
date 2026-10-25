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

import {
  mastraCotTool,
  mastraKnowledgeTool,
  mastraResonanceTool,
  mastraSeasonalityTool,
  mastraWebSearchTool,
} from '../agents/xauusd/read-only-tools';
// Audit plan §1.11 / P1-21 — the integrity check below resolves every
// declared Mastra tool id against the actual `createTool` registrations,
// so a phantom (never-registered) id fails loudly instead of passing
// against a parallel hand-maintained string list.
import { xauusdCalendarTool } from '../agents/xauusd/tools/calendar-tool';
import { xauusdCandlesTool } from '../agents/xauusd/tools/candles-tool';
import { xauusdCorrelationTool } from '../agents/xauusd/tools/correlation-tool';
import { xauusdFundamentalContextTool } from '../agents/xauusd/tools/fundamental-context-tool';
import { xauusdIndicatorsTool } from '../agents/xauusd/tools/indicators-tool';
import { xauusdIntermarketTool } from '../agents/xauusd/tools/intermarket-tool';
import { xauusdMarketStructureTool } from '../agents/xauusd/tools/market-structure-tool';
import { xauusdNewsTool } from '../agents/xauusd/tools/news-tool';
import { xauusdPriceTool } from '../agents/xauusd/tools/price-tool';
import { xauusdSessionLevelsTool } from '../agents/xauusd/tools/session-levels-tool';
import { xauusdSocialSentimentTool } from '../agents/xauusd/tools/social-sentiment-tool';
import { xauusdTechnicalAnalysisTool } from '../agents/xauusd/tools/technical-tool';
import { xauusdVolatilityTool } from '../agents/xauusd/tools/volatility-tool';
import { xauusdResearchPacketTool } from '../packets/research-packet-tool';
import { MASTRA_CAPABILITIES } from './catalog';
import type { MastraCapability, MastraManifestTool } from './types';

const REGISTERED_MASTRA_TOOLS = [
  xauusdResearchPacketTool,
  xauusdPriceTool,
  xauusdCandlesTool,
  xauusdIndicatorsTool,
  xauusdMarketStructureTool,
  xauusdSessionLevelsTool,
  xauusdTechnicalAnalysisTool,
  xauusdCorrelationTool,
  xauusdIntermarketTool,
  xauusdVolatilityTool,
  xauusdNewsTool,
  xauusdCalendarTool,
  xauusdSocialSentimentTool,
  xauusdFundamentalContextTool,
  mastraSeasonalityTool,
  mastraCotTool,
  mastraResonanceTool,
  mastraWebSearchTool,
  mastraKnowledgeTool,
] as const;

/**
 * Capability "tools" that are deliberately not `createTool` registrations.
 * The symbol-research path invokes the cached collector function directly
 * (`collectSymbolResearchPacketCached` in `packets/packet-cache.ts`) instead
 * of going through a Mastra tool, so its id is listed here explicitly. This
 * is the only sanctioned escape hatch — every other declared id must
 * resolve against `REGISTERED_MASTRA_TOOLS` or the legacy registry.
 */
const DIRECT_ADAPTER_TOOL_IDS = new Set<string>(['collect-symbol-research-packet']);

/**
 * The conversation manifest declares XAUUSD-prefixed ids for the three
 * symbol-scoped read-only tools; `agents/xauusd/tools.ts` maps those ids onto
 * the registrations via `XAUUSD_CONVERSATION_TOOL_IDS` (that module cannot be
 * imported here — it reads this manifest at module top level). Mirror the
 * resolution so a declared alias only passes while a real registration with
 * the mapped id actually exists; renames fail loudly at load time.
 */
const ALIASED_MASTRA_TOOL_IDS = new Map<string, string>([
  ['get-xauusd-seasonality', mastraSeasonalityTool.id],
  ['get-xauusd-cot', mastraCotTool.id],
  ['get-xauusd-intermarket-resonance', mastraResonanceTool.id],
]);

/**
 * Assert the capability manifests stay internally consistent and enforceable.
 * Declared tools must resolve to a real registration (legacy registry,
 * `createTool` id, documented alias, or the direct-adapter list) — a phantom
 * name fails loudly instead of silently passing (audit plan §1.11 / P1-21).
 */
export function assertCapabilityManifestIntegrity(
  capabilities: Record<string, MastraCapability> = MASTRA_CAPABILITIES,
): void {
  const knownLegacyTools = new Set<string>(TOOL_NAMES);
  // Some tool modules transitively import this manifest (telemetry → tracing
  // → capabilities). When this assertion runs during that ESM cycle the tool
  // bindings can still be uninitialised; defer to the explicit call sites
  // (tests / boot) instead of reporting a phantom-tool error.
  const registeredTools = REGISTERED_MASTRA_TOOLS.filter(
    (tool): tool is (typeof REGISTERED_MASTRA_TOOLS)[number] =>
      Boolean(tool && typeof (tool as { id?: unknown }).id === 'string'),
  );
  if (registeredTools.length !== REGISTERED_MASTRA_TOOLS.length) return;
  const registeredMastraToolIds = new Set<string>(registeredTools.map((tool) => tool.id));
  const resolvesToRegisteredTool = (tool: string): boolean => {
    if (registeredMastraToolIds.has(tool)) return true;
    const aliasedTarget = ALIASED_MASTRA_TOOL_IDS.get(tool);
    return aliasedTarget !== undefined && registeredMastraToolIds.has(aliasedTarget);
  };
  for (const [id, capability] of Object.entries(capabilities)) {
    if (id !== capability.id) throw new Error(`Capability manifest ID mismatch: ${id}.`);
    for (const tool of capability.tools) {
      if (
        !knownLegacyTools.has(tool) &&
        !resolvesToRegisteredTool(tool) &&
        !DIRECT_ADAPTER_TOOL_IDS.has(tool)
      ) {
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
