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

// Transport-independent update runner.
//
// The public webhook route verifies the signed path token + Telegram secret
// header, resolves the install, and calls this function. Keeping the runner
// free of Next.js lets the same code be exercised in unit tests.

import type { PluginStorage } from '@kestrel/plugin-sdk';

import { saveSettingsForInstall } from '../settings';
import { agentsReply, analyzeReply, askReply, committeeReply } from './ai-commands';
import { dispatchDataCommand } from './commands';
import { consumeLinkToken, linkChat } from './link';
import { sendTelegramText, sendTelegramTyping, telegramApi } from './telegram-api';
import type { BotReply, TelegramBotContext } from './types';

export interface TelegramInstall {
  userId: string;
  tenantId: string;
  settings: Record<string, unknown>;
  storage: PluginStorage;
}

interface TelegramUpdateLike {
  update_id: number;
  message?:
    | {
        message_id: number;
        chat: { id: number; username?: string | undefined; first_name?: string | undefined };
        text?: string | undefined;
        from?:
          | {
              id: number;
              is_bot?: boolean | undefined;
              first_name?: string | undefined;
              username?: string | undefined;
            }
          | undefined;
      }
    | undefined;
  callback_query?:
    | {
        id: string;
        data: string;
        from?: { id: number; is_bot?: boolean | undefined } | undefined;
        message?: { message_id: number; chat: { id: number } } | undefined;
      }
    | undefined;
}

function installContext(
  install: TelegramInstall,
  signal: AbortSignal | undefined,
): TelegramBotContext {
  const chatId = String((install.settings['linkedChatId'] as string | undefined) ?? '');
  return {
    userId: install.userId,
    tenantId: install.tenantId,
    chatId,
    botToken: String(install.settings['botToken'] ?? ''),
    settings: install.settings as TelegramBotContext['settings'],
    storage: install.storage,
    ...(signal ? { signal } : {}),
    saveSettings: async (partial) => {
      const next = await saveSettingsForInstall(
        {
          userId: install.userId,
          tenantId: install.tenantId,
          settings: install.settings,
        },
        partial,
      );
      install.settings = next as unknown as Record<string, unknown>;
      return next;
    },
  };
}

export async function dispatchTelegramCommand(
  command: string,
  args: string[],
  ctx: TelegramBotContext,
): Promise<BotReply> {
  const data = await dispatchDataCommand(command, args, ctx);
  if (data) return data;

  switch (command) {
    case 'analyze':
      return analyzeReply(args[0], args[1], ctx);
    case 'committee':
      return committeeReply(args[0], args[1], ctx);
    case 'ask': {
      const question = args.join(' ').trim();
      return askReply(question, ctx);
    }
    case 'agents':
      return agentsReply(ctx);
    default:
      return {
        text: `Unknown command: /${command}\n\nType /help to see everything I can do.`,
      };
  }
}

async function handleStart(
  ctx: TelegramBotContext,
  chatId: string,
  payload: string | undefined,
): Promise<BotReply> {
  if (!payload) {
    return {
      text: [
        '👋 Welcome to Kestrel Copilot.',
        '',
        'To connect this chat to your Kestrel account:',
        '1. Open Settings → Plugins → Telegram Copilot in the web app.',
        '2. Click “Generate my link”.',
        '3. Tap the link it creates.',
        '',
        'Already linked? Send /help to see every command.',
      ].join('\n'),
    };
  }

  const consumed = await consumeLinkToken(payload);
  if (!consumed || consumed.userId !== ctx.userId || consumed.tenantId !== ctx.tenantId) {
    return {
      text: '❌ This link is invalid or has expired. Generate a fresh link from Settings → Plugins → Telegram Copilot.',
    };
  }

  await linkChat({ userId: consumed.userId, tenantId: ctx.tenantId, chatId });
  await ctx.saveSettings({
    linkedChatId: chatId,
    linkedAt: new Date().toISOString(),
  });

  return {
    text: [
      '✅ This chat is now linked to Kestrel.',
      '',
      'Try /price XAUUSD, /analyze XAUUSD, or /briefing.',
      'Send /help for the full command list.',
    ].join('\n'),
  };
}

function callbackReply(data: string, ctx: TelegramBotContext): Promise<BotReply> | BotReply | null {
  if (data.startsWith('cmd:')) {
    const [, command, ...args] = data.split(':');
    if (!command) return null;
    if (command === 'toggle-briefing') {
      const next = !ctx.settings.briefingEnabled;
      return ctx.saveSettings({ briefingEnabled: next }).then(() => ({
        text: next
          ? `▶️ Daily briefing enabled for ${ctx.settings.briefingTime} ${ctx.settings.timezone}.`
          : '⏸ Daily briefing paused.',
      }));
    }
    if (command === 'toggle-alerts') {
      const next = !ctx.settings.alertsEnabled;
      return ctx.saveSettings({ alertsEnabled: next }).then(() => ({
        text: next ? '🔔 Alert notifications resumed.' : '🔇 Alert notifications muted.',
      }));
    }
    return dispatchTelegramCommand(command, args, ctx);
  }

  // analyze:<mode>:<symbol>
  const analyze = /^(analyze|committee):(quick|single|full|team):([A-Za-z0-9/_-]+)$/i.exec(data);
  if (analyze) {
    const command = analyze[1]!.toLowerCase();
    const mode = analyze[2]!.toLowerCase();
    const symbol = analyze[3]!.toUpperCase();
    return dispatchTelegramCommand(command, [symbol, mode], ctx);
  }
  return null;
}

/**
 * Process one Telegram update. Returns the reply that was sent (for tests)
 * or null when the update was ignored.
 */
export async function handleTelegramUpdate(
  install: TelegramInstall,
  update: TelegramUpdateLike,
  signal?: AbortSignal,
): Promise<BotReply | null> {
  const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id;
  if (!chatId) return null;
  if (update.message?.from?.is_bot || update.callback_query?.from?.is_bot) return null;

  const ctx = installContext(install, signal);
  ctx.chatId = String(chatId);

  const callbackData = update.callback_query?.data;
  if (callbackData) {
    await telegramApi(ctx.botToken)
      .answerCallbackQuery(update.callback_query!.id)
      .catch(() => undefined);
    const reply = await callbackReply(callbackData, ctx);
    if (!reply) {
      await sendTelegramText(ctx.botToken, chatId, 'That button is no longer available.');
      return null;
    }
    await sendTelegramText(ctx.botToken, chatId, reply.text, {
      ...(reply.keyboard ? { keyboard: reply.keyboard } : {}),
    });
    return reply;
  }

  const text = update.message?.text?.trim();
  if (!text) return null;

  const startMatch = /^\/start(?:@\w+)?(?:\s+(.+))?$/i.exec(text);
  if (startMatch) {
    await sendTelegramTyping(ctx.botToken, chatId);
    const reply = await handleStart(ctx, String(chatId), startMatch[1]?.trim());
    await sendTelegramText(ctx.botToken, chatId, reply.text, {
      ...(reply.keyboard ? { keyboard: reply.keyboard } : {}),
    });
    return reply;
  }

  if (!text.startsWith('/')) {
    await sendTelegramTyping(ctx.botToken, chatId);
    const reply = await askReply(text, ctx);
    await sendTelegramText(ctx.botToken, chatId, reply.text, {
      ...(reply.keyboard ? { keyboard: reply.keyboard } : {}),
    });
    return reply;
  }

  const parsed = /^\/([a-zA-Z0-9_]+)(?:@\w+)?(?:\s+(.*))?$/s.exec(text);
  if (!parsed) return null;
  const command = parsed[1]!.toLowerCase();
  const rawArgs = parsed[2]?.trim() ?? '';
  const args = rawArgs.length > 0 ? rawArgs.split(/\s+/) : [];

  await sendTelegramTyping(ctx.botToken, chatId);
  const reply = await dispatchTelegramCommand(command, args, ctx);
  await sendTelegramText(ctx.botToken, chatId, reply.text, {
    ...(reply.keyboard ? { keyboard: reply.keyboard } : {}),
  });
  return reply;
}
