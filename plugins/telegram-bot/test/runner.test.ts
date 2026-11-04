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

// Runner authorization.
//
// The webhook path token and secret header prove an update came from Telegram
// for this bot, not that the sender owns the Kestrel account. Anyone who knows
// a bot's @username can message it, so every command that reads or mutates the
// owner's data must come from the linked chat.

import type { PluginStorage } from '@kestrel/plugin-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sendTelegramText: vi.fn(),
  sendTelegramTyping: vi.fn(),
  answerTelegramCallback: vi.fn(),
  dispatchDataCommand: vi.fn(),
  askReply: vi.fn(),
  analyzeReply: vi.fn(),
  committeeReply: vi.fn(),
  saveSettingsForInstall: vi.fn(),
  consumeLinkToken: vi.fn(),
  linkChat: vi.fn(),
}));

vi.mock('../src/bot/telegram-api', () => ({
  sendTelegramText: mocks.sendTelegramText,
  sendTelegramTyping: mocks.sendTelegramTyping,
  answerTelegramCallback: mocks.answerTelegramCallback,
}));

vi.mock('../src/bot/commands', () => ({
  dispatchDataCommand: mocks.dispatchDataCommand,
}));

vi.mock('../src/bot/ai-commands', () => ({
  askReply: mocks.askReply,
  analyzeReply: mocks.analyzeReply,
  committeeReply: mocks.committeeReply,
}));

vi.mock('../src/bot/link', () => ({
  consumeLinkToken: mocks.consumeLinkToken,
  linkChat: mocks.linkChat,
}));

vi.mock('../src/settings', () => ({
  saveSettingsForInstall: mocks.saveSettingsForInstall,
}));

import {
  handleTelegramUpdate,
  UNAUTHORIZED_CALLBACK_TEXT,
  UNAUTHORIZED_CHAT_TEXT,
  type TelegramInstall,
} from '../src/bot/runner';

const LINKED_CHAT = 555;

function createStorage(): PluginStorage {
  const documents = new Map<string, unknown>();
  const key = (collection: string, entryKey: string): string => `${collection}:${entryKey}`;
  return {
    get: async (collection: string, entryKey: string) => documents.get(key(collection, entryKey)),
    set: async (collection: string, entryKey: string, value: unknown) => {
      documents.set(key(collection, entryKey), value);
    },
    list: async () => [],
    delete: async (collection: string, entryKey: string) => {
      documents.delete(key(collection, entryKey));
    },
    clear: async () => {
      documents.clear();
    },
  } as PluginStorage;
}

function buildInstall(settings: Record<string, unknown> = {}): TelegramInstall {
  return {
    userId: 'user-1',
    tenantId: 'tenant-1',
    settings: { botToken: '1:abc', linkedChatId: String(LINKED_CHAT), ...settings },
    storage: createStorage(),
  };
}

function textUpdate(text: string, chatId: number) {
  return { update_id: 1, message: { message_id: 1, chat: { id: chatId }, text } };
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.dispatchDataCommand.mockResolvedValue({ text: 'dispatched' });
  mocks.askReply.mockResolvedValue({ text: 'answered' });
  mocks.saveSettingsForInstall.mockImplementation(
    async (install: { settings?: Record<string, unknown> }, partial: Record<string, unknown>) => ({
      ...(install.settings ?? {}),
      ...partial,
    }),
  );
});

describe('handleTelegramUpdate — linked chat authorization', () => {
  it('rejects commands from a chat that is not the linked one', async () => {
    const reply = await handleTelegramUpdate(buildInstall(), textUpdate('/positions', 999));

    expect(reply).toEqual({ text: UNAUTHORIZED_CHAT_TEXT });
    expect(mocks.dispatchDataCommand).not.toHaveBeenCalled();
    expect(mocks.sendTelegramText).toHaveBeenCalledWith(
      '1:abc',
      999,
      UNAUTHORIZED_CHAT_TEXT,
      expect.anything(),
    );
  });

  it('rejects free-form questions from an unlinked chat', async () => {
    const reply = await handleTelegramUpdate(
      buildInstall({ linkedChatId: undefined }),
      textUpdate('How is gold trading today?', 999),
    );

    expect(reply).toEqual({ text: UNAUTHORIZED_CHAT_TEXT });
    expect(mocks.askReply).not.toHaveBeenCalled();
  });

  it('runs commands for the linked chat', async () => {
    const reply = await handleTelegramUpdate(
      buildInstall(),
      textUpdate('/price XAUUSD', LINKED_CHAT),
    );

    expect(reply).toEqual({ text: 'dispatched' });
    expect(mocks.dispatchDataCommand).toHaveBeenCalledWith(
      'price',
      ['XAUUSD'],
      expect.objectContaining({ chatId: String(LINKED_CHAT) }),
    );
  });

  it('allows /help without a link but no other command', async () => {
    const install = buildInstall({ linkedChatId: undefined });

    const help = await handleTelegramUpdate(install, textUpdate('/help', 999));
    const positions = await handleTelegramUpdate(install, textUpdate('/positions', 999));

    expect(help).toEqual({ text: 'dispatched' });
    expect(positions).toEqual({ text: UNAUTHORIZED_CHAT_TEXT });
  });

  it('does not let a stranger take over an already linked bot with a bare /start', async () => {
    const reply = await handleTelegramUpdate(buildInstall(), textUpdate('/start', 999));

    expect(reply).toEqual({ text: UNAUTHORIZED_CHAT_TEXT });
    expect(mocks.consumeLinkToken).not.toHaveBeenCalled();
    expect(mocks.linkChat).not.toHaveBeenCalled();
    expect(mocks.saveSettingsForInstall).not.toHaveBeenCalled();
  });

  it('still relinks through /start when a valid one-time token is presented', async () => {
    mocks.consumeLinkToken.mockResolvedValue({
      userId: 'user-1',
      tenantId: 'tenant-1',
      expiresAt: new Date(Date.now() + 60_000),
    });

    const reply = await handleTelegramUpdate(buildInstall(), textUpdate('/start v1_token', 999));

    expect(mocks.consumeLinkToken).toHaveBeenCalledWith('v1_token');
    expect(mocks.linkChat).toHaveBeenCalledWith({
      userId: 'user-1',
      tenantId: 'tenant-1',
      chatId: '999',
    });
    expect(reply?.text).toContain('now linked to Kestrel');
  });

  it('rejects callback buttons tapped from another chat', async () => {
    const reply = await handleTelegramUpdate(buildInstall(), {
      update_id: 2,
      callback_query: {
        id: 'callback-1',
        data: 'cmd:price:XAUUSD',
        message: { message_id: 1, chat: { id: 999 } },
      },
    });

    expect(reply).toEqual({ text: UNAUTHORIZED_CALLBACK_TEXT });
    expect(mocks.answerTelegramCallback).toHaveBeenCalledWith(
      '1:abc',
      'callback-1',
      undefined,
      UNAUTHORIZED_CALLBACK_TEXT,
    );
    expect(mocks.dispatchDataCommand).not.toHaveBeenCalled();
  });
});
