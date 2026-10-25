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

// Static capability registry. XAUUSD-specific reservations live in
// `catalog-xauusd.ts`; runtime lookups live in `resolver.ts`.

import { ALL_SYMBOLS } from '@kestrel/shared';

import { XAUUSD_CAPABILITIES } from './catalog-xauusd';
import {
  CANONICAL_PUBLIC_READ_ONLY_TOOL_NAMES,
  SENSITIVE_USER_READ_TOOL_NAMES,
} from './tool-names';
import type { MastraCapability } from './types';

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
    'convene_committee',
  ],
} as const satisfies Record<'summary' | 'vision' | 'fundamental' | 'technical', readonly string[]>;

export type MastraRoutingDomain = keyof typeof LEGACY_DOMAIN_TOOL_NAMES;

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
  ...XAUUSD_CAPABILITIES,
} as const satisfies Record<string, MastraCapability>;

export type MastraCapabilityId = keyof typeof MASTRA_CAPABILITIES;
