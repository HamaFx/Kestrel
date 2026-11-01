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

// R10 (audit 2026-10-31) — the Telegram transport must be bounded.
//
// grammY's default request timeout is 500s and its abort signal is a separate
// argument of every `Api` method (`Api.sendMessage(chat, text, other, signal)`),
// not a payload field. These tests pin both: the client is constructed with a
// short `timeoutSeconds`, and the signal reaches the method call.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const grammyMocks = vi.hoisted(() => ({
  constructed: [] as Array<{ token: string; options: unknown }>,
  sendMessage: vi.fn(),
  sendChatAction: vi.fn(),
  answerCallbackQuery: vi.fn(),
}));

vi.mock('grammy', () => ({
  Api: class MockApi {
    constructor(token: string, options?: unknown) {
      grammyMocks.constructed.push({ token, options });
    }
    sendMessage = grammyMocks.sendMessage;
    sendChatAction = grammyMocks.sendChatAction;
    answerCallbackQuery = grammyMocks.answerCallbackQuery;
  },
}));

const { sendTelegramText, sendTelegramTyping, answerTelegramCallback, telegramApi } =
  await import('../src/bot/telegram-api');

/** Reject when the signal the caller passed aborts, like grammY would. */
function hangUntilAborted(...args: unknown[]): Promise<never> {
  const signal = args.at(-1) as AbortSignal | undefined;
  return new Promise((_resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Request aborted'));
      return;
    }
    signal?.addEventListener('abort', () => reject(new Error('Request aborted')), { once: true });
  });
}

describe('telegram transport time budget (R10)', () => {
  beforeEach(() => {
    grammyMocks.constructed.length = 0;
    grammyMocks.sendMessage.mockReset();
    grammyMocks.sendMessage.mockResolvedValue({});
    grammyMocks.sendChatAction.mockReset();
    grammyMocks.sendChatAction.mockResolvedValue(true);
    grammyMocks.answerCallbackQuery.mockReset();
    grammyMocks.answerCallbackQuery.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('constructs the client with grammY timeoutSeconds instead of the 500s default', () => {
    telegramApi('bot-token', 15_000);

    expect(grammyMocks.constructed[0]).toEqual({
      token: 'bot-token',
      options: { timeoutSeconds: 15 },
    });
  });

  it('passes the abort signal as the method argument, not in the payload', async () => {
    const controller = new AbortController();

    await sendTelegramText('bot-token', '42', 'hello', { signal: controller.signal });

    const call = grammyMocks.sendMessage.mock.calls[0]!;
    expect(call[0]).toBe('42');
    expect(call[1]).toBe('hello');
    expect(call[2]).not.toHaveProperty('signal');
    expect(call[3]).toBeInstanceOf(AbortSignal);
  });

  it('times out a send that never answers', async () => {
    grammyMocks.sendMessage.mockImplementation(hangUntilAborted);

    const started = Date.now();
    await expect(sendTelegramText('bot-token', '42', 'hello', { timeoutMs: 25 })).rejects.toThrow(
      /aborted/i,
    );

    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('honours an already-cancelled run signal', async () => {
    grammyMocks.sendMessage.mockImplementation(hangUntilAborted);
    const controller = new AbortController();
    controller.abort();

    await expect(
      sendTelegramText('bot-token', '42', 'hello', { signal: controller.signal, timeoutMs: 5_000 }),
    ).rejects.toThrow(/aborted/i);
    const passed = grammyMocks.sendMessage.mock.calls[0]![3] as AbortSignal;
    expect(passed.aborted).toBe(true);
  });

  it('bounds the decorative calls with the same client timeout', async () => {
    await expect(sendTelegramTyping('bot-token', '42')).resolves.toBeUndefined();
    await expect(answerTelegramCallback('bot-token', 'cb-1')).resolves.toBeUndefined();

    // The signal reaches the call and the client itself is capped well below
    // grammY's 500s default.
    expect(grammyMocks.sendChatAction.mock.calls[0]![3]).toBeInstanceOf(AbortSignal);
    expect(grammyMocks.answerCallbackQuery.mock.calls[0]![2]).toBeInstanceOf(AbortSignal);
    for (const entry of grammyMocks.constructed) {
      expect(entry.options).toEqual({ timeoutSeconds: 5 });
    }
  });
});
