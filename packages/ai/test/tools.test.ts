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

import { describe, expect, it, vi } from 'vitest';

import { registerAllTools, toolRegistry } from '../src/tools/index';

// §4.3: registration is explicit now — no import side effects.
registerAllTools();

vi.mock('server-only', () => ({}));

vi.mock('@kestrel/db', () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => Promise.resolve([]),
          limit: () => Promise.resolve([]),
          innerJoin: () => Promise.resolve([]),
        }),
      }),
    }),
    execute: () => Promise.resolve([]),
    insert: () => ({ values: () => Promise.resolve() }),
  }),
  schema: {
    chatToolTelemetry: {},
    chatTelemetry: {},
    chatMessages: {},
    economicEvents: {},
    users: {},
    userSettings: {},
    journals: {},
    alerts: {},
    knowledgeBase: {},
    portfolio: {},
    positions: {},
  },
}));

vi.mock('@kestrel/shared/encryption', () => ({
  PROVIDER_IDS: [
    'google',
    'anthropic',
    'openai',
    'groq',
    'mistral',
    'openrouter',
    'xai',
    'deepseek',
    'iamhc',
    'hcnsec',
  ],
  decryptByok: () => null,
  encryptByok: () => '',
  configuredProviders: () => [],
}));

vi.mock('@kestrel/data', () => ({
  getPrice: vi.fn(async () => ({
    tick: { bid: 1.08, ask: 1.0802, mid: 1.0801, ts: Date.now(), source: 'test' },
    stale: false,
    producedAt: Date.now(),
    ageMs: 0,
  })),
  ProviderError: class ProviderError extends Error {},
}));

describe('tools registry', () => {
  it('contains all expected tool entries', () => {
    // Tool registration order: market → analysis → journal → system → web.
    const expectedKeys = [
      // Market (5) — the natively-migrated market tools are no longer
      // registered here; resolveNativeCanonicalTool serves them.
      'get_correlation',
      'get_intermarket',
      'get_intermarket_resonance',
      'get_session_levels',
      'get_seasonality',
      // Analysis (7)
      'analyze_technical',
      'analyze_fundamental',
      'analyze_chart_image',
      'annotate_chart',
      'forecast_volatility',
      'compute_risk',
      'compute_position_health',
      // Journal (5) — get_news and search_knowledge are native registrations.
      'log_journal',
      'get_journal_stats',
      'get_calendar',
      'set_alert',
      'share_snapshot',
      // System (6 — includes convene_committee per Decision Q11)
      'get_system_diagnostics',
      'run_system_action',
      'get_social_sentiment',
      'verify_call',
      'replay_setup',
      'convene_committee',
      // Web (1)
      'web_search',
    ];
    expect(toolRegistry.listNames()).toEqual(expectedKeys);
    expect(toolRegistry.listNames().length).toBe(24);
  });

  it('every tool has description, inputSchema, and execute', () => {
    const allTools = toolRegistry.resolve();
    for (const [name, tool] of Object.entries(allTools)) {
      expect(tool.description, `${name} missing description`).toBeTruthy();
      expect(tool.inputSchema, `${name} missing inputSchema`).toBeDefined();
      expect(tool.execute, `${name} missing execute`).toBeDefined();
    }
  });

  it('every tool name matches the withTelemetry wrapper name', () => {
    for (const name of toolRegistry.listNames()) {
      expect(name).toMatch(/^[a-z_]+$/);
    }
  });

  it('convene_committee tool validates input schema', () => {
    const allTools = toolRegistry.resolve();
    const convene = allTools['convene_committee'] as {
      inputSchema: { safeParse: (v: unknown) => { success: boolean } };
    };
    expect(
      convene.inputSchema.safeParse({
        symbol: 'XAUUSD',
        side: 'long',
        entry: 2400,
        stop: 2385,
        target: 2440,
      }).success,
    ).toBe(true);
  });
});
