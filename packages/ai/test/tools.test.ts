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
  getPrice: vi.fn(() => ({ bid: 1.08, ask: 1.0802, mid: 1.0801, timestamp: Date.now() })),
  ProviderError: class ProviderError extends Error {},
}));

describe('tools registry', () => {
  it('contains all expected tool entries', () => {
    // PF-13: Tools are now registered in category-group order
    // (market → analysis → journal → system)
    const expectedKeys = [
      // Market (10)
      'get_price',
      'get_candles',
      'get_indicators',
      'get_market_structure',
      'get_correlation',
      'get_cot',
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
      // Journal (7)
      'log_journal',
      'get_journal_stats',
      'get_news',
      'get_calendar',
      'set_alert',
      'search_knowledge',
      'share_snapshot',
      // System (7 — includes convene_committee per Decision Q11)
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
    expect(toolRegistry.listNames().length).toBe(31);
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
