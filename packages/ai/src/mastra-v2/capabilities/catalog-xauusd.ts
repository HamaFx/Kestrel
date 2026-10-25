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

// XAUUSD capability manifests (conversation + verified research).

import type { MastraCapability } from './types';

/** XAUUSD-specific manifests merged into the canonical capability registry. */
export const XAUUSD_CAPABILITIES = {
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
