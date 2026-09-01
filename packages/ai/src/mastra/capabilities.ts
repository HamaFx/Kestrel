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

import { ALL_SYMBOLS, type ToolName } from '@kestrel/shared';

export type MastraCapabilityMode = 'single' | 'quick' | 'standard' | 'full' | 'auto';
export type MastraEvidencePolicy = 'required' | 'optional' | 'none';
export type MastraCapabilityScope = 'read-only' | 'sensitive-read' | 'user-scoped' | 'admin';
export type MastraContentTrust = 'trusted' | 'untrusted';

/**
 * Reviewed read-only legacy-tool exposure by routing domain. Mutations are
 * intentionally defined only by the mutation capability below; a tool is not
 * exposed merely because it exists in the broad legacy registry.
 */
export const LEGACY_DOMAIN_TOOL_NAMES = {
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
  ],
} as const satisfies Record<
  | Exclude<MastraCapabilityMode, 'single' | 'quick' | 'standard' | 'full' | 'auto'>
  | 'summary'
  | 'vision'
  | 'fundamental'
  | 'technical',
  readonly string[]
>;

/**
 * Explicit read-only legacy-tool boundary for the canonical conversational
 * agent. Keep this list here rather than deriving it from the full registry:
 * adding a new tool requires an intentional policy review.
 */
export const CANONICAL_PUBLIC_READ_ONLY_TOOL_NAMES = [
  'get_price',
  'get_candles',
  'get_indicators',
  'get_market_structure',
  'get_session_levels',
  'get_news',
  'get_calendar',
  'get_cot',
  'get_seasonality',
  'get_intermarket',
  'get_intermarket_resonance',
  'get_social_sentiment',
  'get_correlation',
  'forecast_volatility',
  'analyze_technical',
  'analyze_fundamental',
  'compute_risk',
  'web_search',
  'search_knowledge',
  'verify_call',
] as const;

/** Sensitive user-scoped reads require an explicit capability. */
export const SENSITIVE_USER_READ_TOOL_NAMES = [
  'get_journal_stats',
  'get_portfolio_snapshot',
  'compute_position_health',
  'replay_setup',
] as const;

/** Backwards-compatible alias for reviewed public canonical tools. */
export const CANONICAL_READ_ONLY_TOOL_NAMES = CANONICAL_PUBLIC_READ_ONLY_TOOL_NAMES;

export interface MastraCapability {
  readonly id: string;
  readonly version: string;
  readonly allowedSymbols: readonly string[];
  readonly allowedModes: readonly MastraCapabilityMode[];
  readonly scope: MastraCapabilityScope;
  readonly readOnly: boolean;
  readonly tools: readonly string[];
  readonly requiresConfirmation: boolean;
  readonly supportsStreaming: boolean;
  readonly supportsAbort: boolean;
  readonly maxSteps: number;
  readonly maxDurationMs: number;
  readonly evidencePolicy: MastraEvidencePolicy;
  readonly externalData: boolean;
  readonly contentTrust: MastraContentTrust;
}

/**
 * Capability registry for staged migration.
 *
 * Keep capabilities narrow. A route must opt into a capability explicitly;
 * adding a tool to the registry must not silently make it available to every
 * Mastra agent.
 */
export const MASTRA_CAPABILITIES = {
  'xauusd-conversation': {
    id: 'xauusd-conversation',
    version: 'poc-5',
    allowedSymbols: ['XAUUSD'],
    allowedModes: ['single', 'auto'],
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
    allowedSymbols: ALL_SYMBOLS,
    allowedModes: ['single', 'quick', 'standard', 'full'],
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
    allowedSymbols: ALL_SYMBOLS,
    allowedModes: ['single', 'quick', 'standard', 'full', 'auto'],
    scope: 'sensitive-read',
    readOnly: true,
    tools: SENSITIVE_USER_READ_TOOL_NAMES,
    requiresConfirmation: false,
    supportsStreaming: true,
    supportsAbort: true,
    maxSteps: 3,
    maxDurationMs: 55_000,
    evidencePolicy: 'optional',
    externalData: false,
    contentTrust: 'trusted',
  },
  'mutation-workflows': {
    id: 'mutation-workflows',
    version: 'approval-1',
    allowedSymbols: ALL_SYMBOLS,
    allowedModes: ['single', 'quick', 'standard', 'full', 'auto'],
    scope: 'user-scoped',
    readOnly: false,
    tools: ['set_alert', 'log_journal', 'share_snapshot', 'run_system_action'],
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
    allowedSymbols: ['XAUUSD'],
    allowedModes: ['single', 'auto'],
    scope: 'read-only',
    readOnly: true,
    tools: [
      'get_xauusd_research_packet',
      'get_xauusd_price',
      'get_xauusd_candles',
      'get_xauusd_indicators',
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
