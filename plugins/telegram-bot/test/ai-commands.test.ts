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

// Telegram AI turns are mirrored into the web chat history. The thread row
// must exist before `chat_messages` (FK), and a history failure must never
// surface as a reply error.

import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createThread: vi.fn(),
  appendUserMessage: vi.fn(),
  appendAssistantMessage: vi.fn(),
}));

vi.mock('@kestrel/ai', () => ({
  createThread: mocks.createThread,
  appendUserMessage: mocks.appendUserMessage,
  appendAssistantMessage: mocks.appendAssistantMessage,
}));

import { persistTelegramTurnBestEffort } from '../src/bot/ai-commands/shared';

const userMessage: UIMessage = {
  id: 'message-1',
  role: 'user',
  parts: [{ type: 'text', text: 'How is gold trading?' }],
};
const assistantMessage: UIMessage = {
  id: 'message-2',
  role: 'assistant',
  parts: [{ type: 'text', text: 'Gold is range-bound.' }],
};

const turn = {
  userId: 'user-1',
  threadId: 'thread-1',
  title: 'How is gold trading?',
  symbol: 'XAUUSD',
  userMessage,
  assistantMessage,
};

beforeEach(() => {
  mocks.createThread.mockReset();
  mocks.appendUserMessage.mockReset();
  mocks.appendAssistantMessage.mockReset();
  mocks.createThread.mockResolvedValue({ id: 'thread-1' });
});

describe('persistTelegramTurnBestEffort', () => {
  it('creates the deterministic thread before appending the turn', async () => {
    await persistTelegramTurnBestEffort(turn);

    expect(mocks.createThread).toHaveBeenCalledWith('user-1', {
      id: 'thread-1',
      title: 'How is gold trading?',
      pinnedSymbol: 'XAUUSD',
    });
    expect(mocks.appendUserMessage).toHaveBeenCalledWith('user-1', 'thread-1', userMessage);
    expect(mocks.appendAssistantMessage).toHaveBeenCalledWith(
      'user-1',
      'thread-1',
      assistantMessage,
    );
    expect(mocks.createThread.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.appendUserMessage.mock.invocationCallOrder[0]!,
    );
  });

  it('swallows a history failure so the sent reply is never replaced', async () => {
    mocks.createThread.mockRejectedValue(new Error('insert or update violates foreign key'));

    await expect(persistTelegramTurnBestEffort(turn)).resolves.toBeUndefined();
    expect(mocks.appendUserMessage).not.toHaveBeenCalled();
    expect(mocks.appendAssistantMessage).not.toHaveBeenCalled();
  });
});
