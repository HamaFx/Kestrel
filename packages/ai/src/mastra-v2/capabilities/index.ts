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

import { ALL_SYMBOLS, TOOL_NAMES, type ToolName } from '@kestrel/shared';

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
import {
  CANONICAL_PUBLIC_READ_ONLY_TOOL_NAMES,
  SENSITIVE_USER_READ_TOOL_NAMES,
} from './tool-names';

/** Q2 decision: exactly two analysis modes. */
export type MastraCapabilityMode = 'single' | 'full';
export type MastraEvidencePolicy = 'required' | 'optional' | 'none';
export type MastraCapabilityScope = 'read-only' | 'sensitive-read' | 'user-scoped' | 'admin';
export type MastraContentTrust = 'trusted' | 'untrusted';
export type MastraToolCategory =
  | 'public-market-data'
  | 'user-scoped-data'
  | 'untrusted-external-data'
  | 'internal-verification'
  | 'mutation';
export type MastraToolAccess = 'read-only' | 'sensitive-read' | 'write';

export interface MastraManifestTool {
  readonly name: string;
  readonly category: MastraToolCategory;
  readonly access: MastraToolAccess;
  readonly sensitivity: 'public' | 'user-scoped' | 'internal';
  readonly trust: MastraContentTrust;
}

/** Reviewed read-only legacy-tool exposure by routing domain. */
const LEGACY_DOMAIN_TOOL_NAMES = {
  summary: [
    'get_price',
    'search_knowledge',
    'get_news',
    'get_calendar',
    'get_cot',
    'get_journal_stats',
    'get_social_sentiment',
  ],
  vision: [
    'get_price',
    'search_knowledge',
    'analyze_chart_image',
    'get_candles',
    'get_indicators',
    'get_market_structure',
    'get_session_levels',
  ],
  fundamental: [
    'get_price',
    'search_knowledge',
    'get_news',
    'get_calendar',
    'get_cot',
    'analyze_fundamental',
    'get_correlation',
    'get_intermarket',
    'get_intermarket_resonance',
    'get_seasonality',
    'get_social_sentiment',
    'compute_risk',
    'forecast_volatility',
    'verify_call',
    'convene_committee',
    'web_search',
  ],
  technical: [
    'get_price',
    'search_knowledge',
    'get_candles',
    'get_indicators',
    'get_market_structure',
    'get_session_levels',
    'analyze_technical',
    'analyze_chart_image',
    'annotate_chart',
    'compute_position_health',
    'get_journal_stats',
    'replay_setup',
    'get_portfolio_snapshot',
    'convene_committee',
  ],
} as const satisfies Record<'summary' | 'vision' | 'fundamental' | 'technical', readonly string[]>;

export {
  CANONICAL_PUBLIC_READ_ONLY_TOOL_NAMES,
  SENSITIVE_USER_READ_TOOL_NAMES,
} from './tool-names';

export type MastraRoutingDomain = keyof typeof LEGACY_DOMAIN_TOOL_NAMES;

export interface MastraCapability {
  readonly id: string;
  readonly version: string;
  readonly route: string;
  readonly component: string;
  readonly allowedSymbols: readonly string[];
  readonly allowedModes: readonly MastraCapabilityMode[];
  readonly scope: MastraCapabilityScope;
  readonly readOnly: boolean;
  readonly tools: readonly string[];
  readonly toolMetadata: readonly MastraManifestTool[];
  readonly requiresConfirmation: boolean;
  readonly supportsStreaming: boolean;
  readonly supportsAbort: boolean;
  readonly maxSteps: number;
  readonly maxDurationMs: number;
  readonly evidencePolicy: MastraEvidencePolicy;
  readonly externalData: boolean;
  readonly contentTrust: MastraContentTrust;
  /**
   * Capability-specific semantic recall policy (Phase 9). Defaults to true;
   * the execution plan's memoryPolicy carries the resolved value to runners.
   */
  readonly semanticRecall?: boolean;
  readonly domainTools?: Readonly<Partial<Record<MastraRoutingDomain, readonly string[]>>>;
}

export interface MastraGuardrailPolicy {
  /** `strict` rejects the turn when the detector model cannot load. */
  readonly mode: 'strict' | 'availability';
  /** `block` rejects injections; `rewrite` neutralizes them. */
  readonly strategy: 'block' | 'rewrite';
}

/**
 * Audit plan §1.2 — guardrail policy derives from the manifest's trust level,
 * never from `NODE_ENV`. Capabilities that surface untrusted external data
 * (news, calendar, social sentiment, web search) fail closed: `strict + block`.
 * Trusted-only capabilities degrade gracefully (`availability + rewrite`).
 */
export function guardrailPolicyForCapability(
  capability: Pick<MastraCapability, 'contentTrust'>,
): MastraGuardrailPolicy {
  return capability.contentTrust === 'untrusted'
    ? { mode: 'strict', strategy: 'block' }
    : { mode: 'availability', strategy: 'rewrite' };
}

/**
 * Capability registry for staged migration.
 *
 * Keep capabilities narrow. A route must opt into a capability explicitly;
 * adding a tool to the registry must not silently make it available to every
 * Mastra agent.
 */
export const MASTRA_CAPABILITIES = {
  'canonical-chat': {
    id: 'canonical-chat',
    version: 'p4-1',
    route: 'canonical-chat',
    component: 'mastra-canonical-chat',
    allowedSymbols: ALL_SYMBOLS,
    allowedModes: ['single', 'full'],
    scope: 'read-only',
    readOnly: true,
    tools: CANONICAL_PUBLIC_READ_ONLY_TOOL_NAMES,
    toolMetadata: CANONICAL_PUBLIC_READ_ONLY_TOOL_NAMES.map((name) => ({
      name,
      category: 'public-market-data' as const,
      access: 'read-only' as const,
      sensitivity: 'public' as const,
      trust:
        name === 'web_search' || name === 'search_knowledge'
          ? ('untrusted' as const)
          : ('trusted' as const),
    })),
    requiresConfirmation: false,
    supportsStreaming: true,
    supportsAbort: true,
    maxSteps: 6,
    maxDurationMs: 55_000,
    evidencePolicy: 'optional',
    externalData: true,
    contentTrust: 'untrusted',
    domainTools: LEGACY_DOMAIN_TOOL_NAMES,
  },
  'xauusd-conversation': {
    id: 'xauusd-conversation',
    version: 'poc-5',
    route: 'xauusd-conversation',
    component: 'mastra-xauusd-conversation',
    allowedSymbols: ['XAUUSD'],
    allowedModes: ['single'],
    scope: 'read-only',
    readOnly: true,
    tools: [
      'get-xauusd-market-structure',
      'get-xauusd-session-levels',
      'analyze-xauusd-technical',
      'get-xauusd-correlation',
      'get-xauusd-intermarket',
      'forecast-xauusd-volatility',
      'get-xauusd-news',
      'get-xauusd-calendar',
      'get-xauusd-social-sentiment',
      'get-xauusd-fundamental-context',
      'get-xauusd-seasonality',
      'get-xauusd-cot',
      'get-xauusd-intermarket-resonance',
      'search-untrusted-web',
      'search-untrusted-knowledge',
    ],
    toolMetadata: [
      ...[
        'get-xauusd-market-structure',
        'get-xauusd-session-levels',
        'analyze-xauusd-technical',
        'get-xauusd-correlation',
        'get-xauusd-intermarket',
        'forecast-xauusd-volatility',
        'get-xauusd-news',
        'get-xauusd-calendar',
        'get-xauusd-social-sentiment',
        'get-xauusd-fundamental-context',
        'get-xauusd-seasonality',
        'get-xauusd-cot',
        'get-xauusd-intermarket-resonance',
      ].map((name) => ({
        name,
        category: 'public-market-data' as const,
        access: 'read-only' as const,
        sensitivity: 'public' as const,
        trust: 'trusted' as const,
      })),
      {
        name: 'search-untrusted-web',
        category: 'untrusted-external-data',
        access: 'read-only',
        sensitivity: 'public',
        trust: 'untrusted',
      },
      {
        name: 'search-untrusted-knowledge',
        category: 'untrusted-external-data',
        access: 'read-only',
        sensitivity: 'public',
        trust: 'untrusted',
      },
    ],
    requiresConfirmation: false,
    supportsStreaming: true,
    supportsAbort: true,
    maxSteps: 3,
    maxDurationMs: 55_000,
    evidencePolicy: 'required',
    externalData: true,
    contentTrust: 'untrusted',
  },
  'symbol-research': {
    id: 'symbol-research',
    version: 'mode-2',
    route: 'symbol-research',
    component: 'mastra-symbol-research',
    allowedSymbols: ALL_SYMBOLS,
    allowedModes: ['single', 'full'],
    scope: 'read-only',
    readOnly: true,
    tools: [
      'collect-symbol-research-packet',
      'get-symbol-seasonality',
      'get-symbol-cot',
      'get-symbol-intermarket-resonance',
      'search-untrusted-web',
      'search-untrusted-knowledge',
    ],
    toolMetadata: [
      {
        name: 'collect-symbol-research-packet',
        category: 'public-market-data',
        access: 'read-only',
        sensitivity: 'public',
        trust: 'trusted',
      },
      {
        name: 'get-symbol-seasonality',
        category: 'public-market-data',
        access: 'read-only',
        sensitivity: 'public',
        trust: 'trusted',
      },
      {
        name: 'get-symbol-cot',
        category: 'public-market-data',
        access: 'read-only',
        sensitivity: 'public',
        trust: 'trusted',
      },
      {
        name: 'get-symbol-intermarket-resonance',
        category: 'public-market-data',
        access: 'read-only',
        sensitivity: 'public',
        trust: 'trusted',
      },
      {
        name: 'search-untrusted-web',
        category: 'untrusted-external-data',
        access: 'read-only',
        sensitivity: 'public',
        trust: 'untrusted',
      },
      {
        name: 'search-untrusted-knowledge',
        category: 'untrusted-external-data',
        access: 'read-only',
        sensitivity: 'public',
        trust: 'untrusted',
      },
    ],
    requiresConfirmation: false,
    supportsStreaming: true,
    supportsAbort: true,
    maxSteps: 5,
    maxDurationMs: 55_000,
    evidencePolicy: 'required',
    externalData: true,
    contentTrust: 'untrusted',
  },
  'sensitive-user-read': {
    id: 'sensitive-user-read',
    version: '1',
    route: 'sensitive-user-read',
    component: 'mastra-sensitive-user-read',
    allowedSymbols: ALL_SYMBOLS,
    allowedModes: ['single', 'full'],
    scope: 'sensitive-read',
    readOnly: true,
    tools: SENSITIVE_USER_READ_TOOL_NAMES,
    toolMetadata: SENSITIVE_USER_READ_TOOL_NAMES.map((name) => ({
      name,
      category: 'user-scoped-data' as const,
      access: 'sensitive-read' as const,
      sensitivity: 'user-scoped' as const,
      trust: 'trusted' as const,
    })),
    requiresConfirmation: false,
    supportsStreaming: true,
    supportsAbort: true,
    maxSteps: 3,
    maxDurationMs: 55_000,
    evidencePolicy: 'optional',
    externalData: false,
    contentTrust: 'trusted',
    // Sensitive user-scoped reads answer from the user's own data only;
    // semantic recall across unrelated threads is not part of this policy.
    semanticRecall: false,
  },
  'mutation-workflows': {
    id: 'mutation-workflows',
    version: 'approval-1',
    route: 'mutation-draft',
    component: 'mastra-mutation-workflows',
    allowedSymbols: ALL_SYMBOLS,
    allowedModes: ['single', 'full'],
    scope: 'user-scoped',
    readOnly: false,
    tools: ['set_alert', 'log_journal', 'share_snapshot', 'run_system_action'],
    toolMetadata: ['set_alert', 'log_journal', 'share_snapshot', 'run_system_action'].map(
      (name) => ({
        name,
        category: 'mutation' as const,
        access: 'write' as const,
        sensitivity: 'user-scoped' as const,
        trust: 'trusted' as const,
      }),
    ),
    requiresConfirmation: true,
    supportsStreaming: false,
    supportsAbort: true,
    maxSteps: 1,
    maxDurationMs: 15_000,
    evidencePolicy: 'none',
    externalData: false,
    contentTrust: 'trusted',
  },
  'xauusd-research': {
    id: 'xauusd-research',
    version: 'poc-5',
    route: 'xauusd_research',
    component: 'mastra-xauusd-research',
    allowedSymbols: ['XAUUSD'],
    allowedModes: ['single'],
    scope: 'read-only',
    readOnly: true,
    // Audit plan §1.11 / P1-21 — these are the real registered `createTool`
    // ids (hyphenated), so the manifest is enforceable against the actual
    // tool registrations instead of listing phantom underscore names.
    tools: [
      'get-xauusd-research-packet',
      'get-xauusd-price',
      'get-xauusd-candles',
      'get-xauusd-indicators',
    ],
    toolMetadata: [
      {
        name: 'get-xauusd-research-packet',
        category: 'public-market-data',
        access: 'read-only',
        sensitivity: 'public',
        trust: 'trusted',
      },
      {
        name: 'get-xauusd-price',
        category: 'public-market-data',
        access: 'read-only',
        sensitivity: 'public',
        trust: 'trusted',
      },
      {
        name: 'get-xauusd-candles',
        category: 'public-market-data',
        access: 'read-only',
        sensitivity: 'public',
        trust: 'trusted',
      },
      {
        name: 'get-xauusd-indicators',
        category: 'public-market-data',
        access: 'read-only',
        sensitivity: 'public',
        trust: 'trusted',
      },
    ],
    requiresConfirmation: false,
    // Conversational XAUUSD turns use Mastra's token stream; verified reports
    // remain buffered until their verifier succeeds.
    supportsStreaming: true,
    supportsAbort: true,
    maxSteps: 1,
    maxDurationMs: 55_000,
    evidencePolicy: 'required',
    externalData: true,
    contentTrust: 'untrusted',
  },
} as const satisfies Record<string, MastraCapability>;

export type MastraCapabilityId = keyof typeof MASTRA_CAPABILITIES;

/** Read-only manifest metadata used by route, tool, and telemetry consumers. */
export function manifestForCapability(capabilityId: MastraCapabilityId): MastraCapability {
  return MASTRA_CAPABILITIES[capabilityId];
}

export function manifestToolNames(capabilityId: MastraCapabilityId): readonly string[] {
  return manifestForCapability(capabilityId).toolMetadata.map((tool) => tool.name);
}

export function manifestToolsForDomain(domain: MastraRoutingDomain): readonly string[] {
  return MASTRA_CAPABILITIES['canonical-chat'].domainTools?.[domain] ?? [];
}

export interface MastraCapabilityUiMetadata {
  readonly id: MastraCapabilityId;
  readonly version: string;
  readonly route: string;
  readonly component: string;
  readonly scope: MastraCapabilityScope;
  readonly readOnly: boolean;
  readonly supportsStreaming: boolean;
  readonly maxSteps: number;
  readonly maxDurationMs: number;
  readonly tools: readonly MastraManifestTool[];
}

export function capabilityUiMetadata(capabilityId: MastraCapabilityId): MastraCapabilityUiMetadata {
  const capability = manifestForCapability(capabilityId);
  return {
    id: capability.id as MastraCapabilityId,
    version: capability.version,
    route: capability.route,
    component: capability.component,
    scope: capability.scope,
    readOnly: capability.readOnly,
    supportsStreaming: capability.supportsStreaming,
    maxSteps: capability.maxSteps,
    maxDurationMs: capability.maxDurationMs,
    tools: capability.toolMetadata,
  };
}

export function capabilityTelemetryLabels(
  capabilityId: MastraCapabilityId,
): Record<string, string> {
  const capability = manifestForCapability(capabilityId);
  return {
    capabilityId: capability.id,
    capabilityVersion: capability.version,
    capabilityRoute: capability.route,
    capabilityScope: capability.scope,
  };
}

/**
 * Real `createTool` registrations a capability manifest may declare. Built
 * from the imported tool objects (audit plan §1.11 / P1-21) so the integrity
 * check can only pass when a declared id resolves to an actual registration —
 * the previous hand-maintained string list let phantom ids through.
 */
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

export type MastraCapabilityRejectionReason =
  | 'unknown-capability'
  | 'unsupported-symbol'
  | 'unsupported-mode'
  | 'model-override'
  | 'mutation-request'
  | 'confirmation-required'
  | 'mutations-disabled';

export interface MastraCapabilityRequest {
  capabilityId: string;
  symbol: string;
  mode: MastraCapabilityMode;
  hasModelOverride?: boolean;
  mutationRequested?: boolean;
  confirmed?: boolean;
}

export type MastraCapabilityDecision =
  | {
      allowed: true;
      capability: MastraCapability;
    }
  | {
      allowed: false;
      capability: MastraCapability | null;
      reason: MastraCapabilityRejectionReason;
    };

/** Resolve a capability without allowing unknown IDs to fall through. */
export function getMastraCapability(capabilityId: string): MastraCapability | null {
  return MASTRA_CAPABILITIES[capabilityId as MastraCapabilityId] ?? null;
}

/**
 * Apply the server-side capability boundary before model execution.
 *
 * This policy intentionally does not inspect model output. Symbol, mode,
 * mutation, and confirmation permissions are properties of the request and
 * route, not decisions delegated to the model.
 */
export function evaluateMastraCapability(
  request: MastraCapabilityRequest,
): MastraCapabilityDecision {
  const capability = getMastraCapability(request.capabilityId);
  if (!capability) {
    return { allowed: false, capability: null, reason: 'unknown-capability' };
  }

  if (!capability.allowedSymbols.includes(request.symbol)) {
    return { allowed: false, capability, reason: 'unsupported-symbol' };
  }

  if (!capability.allowedModes.includes(request.mode)) {
    return { allowed: false, capability, reason: 'unsupported-mode' };
  }

  if (request.hasModelOverride) {
    return { allowed: false, capability, reason: 'model-override' };
  }

  if (request.mutationRequested && capability.readOnly) {
    return { allowed: false, capability, reason: 'mutation-request' };
  }

  if (
    request.mutationRequested &&
    !capability.readOnly &&
    process.env.ENABLE_MASTRA_MUTATIONS !== 'true'
  ) {
    return { allowed: false, capability, reason: 'mutations-disabled' };
  }

  if (capability.requiresConfirmation && !request.confirmed) {
    return { allowed: false, capability, reason: 'confirmation-required' };
  }

  return { allowed: true, capability };
}

/**
 * Type-level assertion for the current XAUUSD capability tool list.
 * The legacy tool-name union is intentionally not used here because Mastra
 * tool IDs are distinct from legacy AI SDK tool names.
 */
export type MastraCapabilityToolName =
  ToolName | (typeof MASTRA_CAPABILITIES)[MastraCapabilityId]['tools'][number];
