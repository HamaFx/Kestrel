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

import { describe, expect, it } from 'vitest';

import { BotDispatcher, getBotDispatcher } from './dispatcher';
import { parseCommand } from './types';

describe('parseCommand', () => {
  it.each([
    ['a simple command', '/analyze XAUUSD', 'analyze', ['XAUUSD']],
    ['a command with multiple args', '/alert XAUUSD > 2700', 'alert', ['XAUUSD', '>', '2700']],
    ['a command with @botname suffix', '/price@kestrelbot EURUSD', 'price', ['EURUSD']],
    ['a command with no args', '/help', 'help', []],
    ['non-command text', 'hello world', '', []],
    ['an empty string', '', '', []],
    ['extra whitespace', '/ask   is   gold   bullish?', 'ask', ['is', 'gold', 'bullish?']],
    ['an uppercase command name', '/ANALYZE XAUUSD', 'analyze', ['XAUUSD']],
  ])('parses %s', (_label, input, expectedCommand, expectedArgs) => {
    const result = parseCommand(input);
    expect(result.command).toBe(expectedCommand);
    expect(result.args).toEqual(expectedArgs);
  });
});

describe('BotDispatcher', () => {
  it('registers and dispatches commands', async () => {
    const dispatcher = new BotDispatcher();
    const ctx = {
      userId: 'test-user',
      chatId: '123',
      platform: 'telegram' as const,
    };

    const response = await dispatcher.dispatch('/help', ctx);
    expect(response.text).toBeDefined();
    expect(response.text).toContain('Kestrel Bot Commands');
  });

  it('returns help for unknown commands', async () => {
    const dispatcher = new BotDispatcher();
    const ctx = {
      userId: 'test-user',
      chatId: '123',
      platform: 'telegram' as const,
    };

    const response = await dispatcher.dispatch('/nonexistent', ctx);
    expect(response.text).toContain('Unknown command');
    expect(response.text).toContain('/help');
  });

  it('returns help for non-command text', async () => {
    const dispatcher = new BotDispatcher();
    const ctx = {
      userId: 'test-user',
      chatId: '123',
      platform: 'telegram' as const,
    };

    const response = await dispatcher.dispatch('hello there', ctx);
    expect(response.text).toContain('Kestrel Bot Commands');
  });

  it('listCommands returns all registered commands', () => {
    const dispatcher = new BotDispatcher();
    const commands = dispatcher.listCommands();
    const names = commands.map((c) => c.name);

    expect(names).toContain('help');
    expect(names).toContain('price');
    expect(names).toContain('analyze');
    expect(names).toContain('ask');
    expect(names).toContain('status');
    expect(names).toContain('chart');
    expect(names).toContain('alert');
    expect(names).toContain('positions');
    expect(names).toContain('link');
  });

  it('getBotDispatcher returns a singleton', () => {
    const d1 = getBotDispatcher();
    const d2 = getBotDispatcher();
    expect(d1).toBe(d2);
  });

  it.each([
    ['price', 'Usage: /price'],
    ['alert', 'Usage: /alert'],
    ['link', 'Link Your Kestrel Account'],
    ['ask', 'Usage: /ask'],
    ['analyze', 'Usage: /analyze'],
    ['chart', 'Usage: /chart'],
  ])('dispatches /%s with no args → usage/instructions response', async (command, expectedText) => {
    const dispatcher = new BotDispatcher();
    const ctx = {
      userId: 'test-user',
      chatId: '123',
      platform: 'telegram' as const,
    };

    const response = await dispatcher.dispatch(`/${command}`, ctx);
    expect(response.text).toContain(expectedText);
  });
});
