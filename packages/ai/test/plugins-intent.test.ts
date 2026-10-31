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

// Phase 2 (P0-3/P0-4) — installed-plugin intent classifier.

import { describe, expect, it } from 'vitest';

import { detectInstalledPluginIntent } from '../src/plugins/intent';

describe('detectInstalledPluginIntent', () => {
  it('matches paper trading trade actions only when the plugin is installed', () => {
    for (const prompt of [
      'Buy 1 lot XAUUSD with stop at 3300',
      'Show my XAUUSD paper positions',
      'Close my EURUSD position',
      'Place a limit order on EURUSD at 1.0850',
      'Deploy this strategy to paper',
      'What is my paper account balance?',
    ]) {
      expect(detectInstalledPluginIntent(prompt, ['paper-trading']), prompt).toMatchObject({
        pluginId: 'paper-trading',
      });
      expect(detectInstalledPluginIntent(prompt, []), prompt).toBeNull();
    }
  });

  it('never rescues explicit live-broker / real-money execution', () => {
    for (const prompt of [
      'Buy 1 lot XAUUSD on my live account',
      'Place a real money order on EURUSD',
      'Send the order to my MT5 broker',
    ]) {
      expect(detectInstalledPluginIntent(prompt, ['paper-trading']), prompt).toBeNull();
    }
  });

  it('matches natural trader phrasing for stop management, trimming, and strategy testing', () => {
    expect(
      detectInstalledPluginIntent('Move my XAUUSD stop to breakeven', ['paper-trading']),
    ).toMatchObject({ pluginId: 'paper-trading' });
    expect(
      detectInstalledPluginIntent('Trail my stop on EURUSD by 15 pips', ['paper-trading']),
    ).toMatchObject({ pluginId: 'paper-trading' });
    expect(
      detectInstalledPluginIntent('Trim half of my gold position', ['paper-trading']),
    ).toMatchObject({ pluginId: 'paper-trading' });
    expect(
      detectInstalledPluginIntent('Flatten my sandbox positions', ['paper-trading']),
    ).toMatchObject({ pluginId: 'paper-trading' });
    expect(
      detectInstalledPluginIntent('Pause my deployed strategy', ['paper-trading']),
    ).toMatchObject({ pluginId: 'paper-trading' });
    expect(
      detectInstalledPluginIntent('Test a strategy on XAUUSD 15m using FVG', ['backtesting']),
    ).toMatchObject({ pluginId: 'backtesting' });
  });

  it('matches backtesting research prompts when the plugin is installed', () => {
    const prompt = 'Backtest an RSI crossover strategy on XAUUSD 1h';
    expect(detectInstalledPluginIntent(prompt, ['backtesting'])).toMatchObject({
      pluginId: 'backtesting',
      reason: 'backtesting-keyword',
    });
    expect(detectInstalledPluginIntent(prompt, ['paper-trading'])).toBeNull();
  });

  it('matches telegram scheduling prompts when the plugin is installed', () => {
    expect(
      detectInstalledPluginIntent('Schedule my daily Telegram briefing', ['telegram-bot']),
    ).toMatchObject({
      pluginId: 'telegram-bot',
      reason: 'telegram-keyword',
    });
    expect(detectInstalledPluginIntent('Schedule my daily briefing', [])).toBeNull();
  });

  it('matches custom-agent prompts and slash commands', () => {
    expect(
      detectInstalledPluginIntent('Create a custom agent for risk reviews', ['custom-agents']),
    ).toMatchObject({ pluginId: 'custom-agents' });
    expect(detectInstalledPluginIntent('/backtest RSI on gold', ['backtesting'])).toMatchObject({
      pluginId: 'backtesting',
    });
    expect(detectInstalledPluginIntent('/paper', ['paper-trading'])).toMatchObject({
      pluginId: 'paper-trading',
    });
    expect(detectInstalledPluginIntent('/agents', ['custom-agents'])).toMatchObject({
      pluginId: 'custom-agents',
    });
    expect(detectInstalledPluginIntent('/telegram', ['telegram-bot'])).toMatchObject({
      pluginId: 'telegram-bot',
    });
  });

  it('keeps ordinary research prompts free of plugin intents', () => {
    expect(
      detectInstalledPluginIntent('What is the current XAUUSD bias and key levels?', [
        'paper-trading',
        'backtesting',
        'telegram-bot',
        'custom-agents',
      ]),
    ).toBeNull();
    expect(detectInstalledPluginIntent('   ', ['paper-trading'])).toBeNull();
  });
});
