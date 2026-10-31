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

// Phase 2 (P0-4) — installed-plugin intents must not be hijacked by the
// XAUUSD / symbol-research routes, which carry no plugin tools.

import { describe, expect, it } from 'vitest';

import { decideMastraExecution } from '../src/mastra-v2';

const settings = {
  aiApiKeys: null,
  chatModel: null,
} as never;
const env = {} as never;
// Symbol research resolves a model eagerly; give it a valid provider key for
// the regression assertions that stay on the research routes.
const researchEnv = { GOOGLE_GENERATIVE_AI_API_KEY: 'test-key' } as never;
const researchSettings = {
  aiApiKeys: null,
  chatModel: 'google:gemini-2.5-flash',
} as never;

function message(text: string) {
  return {
    id: 'message-1',
    role: 'user' as const,
    parts: [{ type: 'text' as const, text }],
  };
}

describe('decideMastraExecution — installed plugin intents (P0-4)', () => {
  it('routes a backtest prompt on XAUUSD to canonical chat when backtesting is installed', async () => {
    const decision = await decideMastraExecution({
      userMessage: message('Backtest an RSI crossover strategy on XAUUSD 1h'),
      mode: 'single',
      settings,
      env,
      installedPluginIds: ['backtesting'],
    });

    expect(decision.route).toBe('canonical-chat');
    expect(decision.modelPurpose).toBe('canonical-chat');
    expect(decision.capability).toBeNull();
    expect(decision.xauusdChatKind).toBeNull();
  });

  it('routes a paper order on XAUUSD to canonical chat when paper-trading is installed', async () => {
    const decision = await decideMastraExecution({
      userMessage: message('Buy 1 lot XAUUSD in my paper account'),
      mode: 'single',
      settings,
      env,
      installedPluginIds: ['paper-trading'],
    });

    expect(decision.route).toBe('canonical-chat');
    expect(decision.capability).toBeNull();
  });

  it('routes a Telegram scheduling prompt to canonical chat when telegram-bot is installed', async () => {
    const decision = await decideMastraExecution({
      userMessage: message('Schedule my daily briefing on Telegram'),
      mode: 'single',
      settings,
      env,
      installedPluginIds: ['telegram-bot'],
    });

    expect(decision.route).toBe('canonical-chat');
  });

  it('keeps research prompts on the XAUUSD route even with every plugin installed', async () => {
    const decision = await decideMastraExecution({
      userMessage: message('What is the current XAUUSD bias and key levels?'),
      mode: 'single',
      settings: researchSettings,
      env: researchEnv,
      installedPluginIds: ['backtesting', 'paper-trading', 'telegram-bot', 'custom-agents'],
    });

    expect(decision.route).toBe('xauusd-research');
    expect(decision.capability).toMatchObject({ capability: { id: 'xauusd-research' } });
  });

  it('does not override route selection when no plugins are installed (regression)', async () => {
    const decision = await decideMastraExecution({
      userMessage: message('Backtest an RSI crossover strategy on XAUUSD 1h'),
      mode: 'single',
      settings: researchSettings,
      env: researchEnv,
    });

    // No installed-plugin match: the pre-existing XAUUSD path stays in charge.
    expect(decision.route).toBe('xauusd-conversation');
  });

  it('routes backtest and paper-trading commands to canonical-chat even in full mode or with two symbols', async () => {
    const fullModeBacktest = await decideMastraExecution({
      userMessage: message('Backtest an RSI pullback strategy on XAUUSD 1h'),
      mode: 'full',
      settings,
      env,
      installedPluginIds: ['backtesting'],
    });
    expect(fullModeBacktest.route).toBe('canonical-chat');

    const multiSymbolBacktest = await decideMastraExecution({
      userMessage: message('Backtest RSI on XAUUSD and EURUSD'),
      mode: 'single',
      settings,
      env,
      installedPluginIds: ['backtesting'],
    });
    expect(multiSymbolBacktest.route).toBe('canonical-chat');
  });

  it('keeps core mutations ahead of plugin intents while plugin commands beat comparisons', async () => {
    // Phase 4 (roadmap Phase 5): an explicit paper-trading command is answered
    // where the plugin tools live, even when the prompt names two symbols.
    const comparison = await decideMastraExecution({
      userMessage: message('Buy 1 lot XAUUSD in my paper account and 2 lots of EURUSD'),
      mode: 'single',
      settings: researchSettings,
      env: researchEnv,
      installedPluginIds: ['paper-trading'],
    });
    expect(comparison.route).toBe('canonical-chat');

    const mutation = await decideMastraExecution({
      userMessage: message('Schedule my Telegram briefing and set an alert for gold'),
      mode: 'single',
      settings,
      env,
      installedPluginIds: ['telegram-bot'],
    });
    expect(mutation.route).toBe('mutation');
  });
});
