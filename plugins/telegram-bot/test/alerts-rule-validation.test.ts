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

// Phase 3 Task 1 — the Telegram `/alert` command must create alerts through
// the canonical `@kestrel/ai` repository, which re-validates the rule with
// `AlertRuleSchema` before insert. The legacy `@kestrel/db` helper inserted
// the caller-provided `unknown` rule with zero validation, so a malformed
// rule could reach the evaluator. This test pins both halves: the plugin
// calls `@kestrel/ai`'s `createAlert` (not a `@kestrel/db` twin), and the
// rule it builds is `AlertRuleSchema`-valid.

import { AlertRuleSchema } from '@kestrel/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { alertReply } from '../src/bot/commands/alerts';
import type { TelegramBotContext } from '../src/bot/types';

const mocks = vi.hoisted(() => ({
  createAlert: vi.fn(async (_input: unknown) => ({ id: 'alert-1' })),
}));

vi.mock('@kestrel/ai', () => ({ createAlert: mocks.createAlert }));

const ctx = { userId: 'user-1' } as unknown as TelegramBotContext;

describe('telegram /alert — validated repository boundary', () => {
  beforeEach(() => {
    mocks.createAlert.mockClear();
  });

  it('creates the alert through @kestrel/ai with an AlertRuleSchema-valid rule', async () => {
    const reply = await alertReply(['XAUUSD', '>', '2700'], ctx);

    expect(reply.text).toContain('Alert created');
    expect(mocks.createAlert).toHaveBeenCalledOnce();
    const input = mocks.createAlert.mock.calls[0]![0] as {
      userId: string;
      rule: unknown;
      channels: string[];
    };
    expect(input.userId).toBe('user-1');
    expect(input.channels).toEqual(['telegram-bot']);
    expect(AlertRuleSchema.safeParse(input.rule).success).toBe(true);
  });

  it('reports a rejected rule instead of inserting it', async () => {
    mocks.createAlert.mockRejectedValueOnce(new Error('rule rejected by AlertRuleSchema'));

    const reply = await alertReply(['XAUUSD', '>', '2700'], ctx);

    expect(reply.text).toMatch(/could not create the alert/i);
  });

  it('never calls the repository for an invalid operator or level', async () => {
    await alertReply(['XAUUSD', '~', '2700'], ctx);
    await alertReply(['XAUUSD', '>', 'not-a-number'], ctx);
    await alertReply(['NOTASYMBOL', '>', '2700'], ctx);

    expect(mocks.createAlert).not.toHaveBeenCalled();
  });
});
