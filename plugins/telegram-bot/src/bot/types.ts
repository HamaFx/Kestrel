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

import type { PluginStorage } from '@kestrel/plugin-sdk';
import { InlineKeyboard } from 'grammy';

import type { TelegramSettings } from '../settings';

export interface TelegramBotContext {
  userId: string;
  tenantId: string;
  chatId: string;
  botToken: string;
  settings: TelegramSettings;
  storage: PluginStorage;
  signal?: AbortSignal | undefined;
  saveSettings: (partial: Partial<TelegramSettings>) => Promise<TelegramSettings>;
}

export interface BotReply {
  text: string;
  parseMode?: 'HTML' | 'MarkdownV2';
  keyboard?: InlineKeyboard;
}

export interface ParsedBotCommand {
  command: string;
  args: string[];
}

/** Parse `/price XAUUSD@KestrelBot` and callback data like `analyze:full:XAUUSD`. */
export function parseBotCommand(text: string): ParsedBotCommand {
  const trimmed = text.trim();

  const callback = /^(analyze|committee):(quick|single|full|team):([A-Za-z0-9/_-]+)$/i.exec(
    trimmed,
  );
  if (callback) {
    return {
      command: callback[1]!.toLowerCase(),
      args: [callback[3]!.toUpperCase(), callback[2]!.toLowerCase()],
    };
  }

  if (!trimmed.startsWith('/')) return { command: '', args: [] };

  const [rawCommand, ...args] = trimmed.slice(1).split(/\s+/);
  if (!rawCommand) return { command: '', args: [] };
  return {
    command: rawCommand.toLowerCase().replace(/@\w+$/, ''),
    args: args.filter(Boolean),
  };
}

export const COMMAND_DESCRIPTIONS: ReadonlyArray<{ command: string; description: string }> = [
  { command: 'price', description: 'Current price — /price XAUUSD' },
  { command: 'analyze', description: 'AI market check — /analyze XAUUSD quick|full' },
  { command: 'ask', description: 'Ask a question or an agent — /ask @handle XAUUSD view' },
  { command: 'agents', description: 'List your custom agents — /agents' },
  { command: 'committee', description: 'Full 4-expert team — /committee XAUUSD' },
  { command: 'news', description: 'Latest market headlines — /news [symbol]' },
  { command: 'calendar', description: 'Economic calendar — /calendar [count]' },
  { command: 'positions', description: 'Open portfolio positions — /positions' },
  { command: 'alert', description: 'Create an alert — /alert XAUUSD > 2700' },
  { command: 'status', description: 'System and account status — /status' },
  { command: 'me', description: 'Your account and usage — /me' },
  { command: 'briefing', description: 'Send the market briefing now — /briefing' },
  { command: 'settings', description: 'Bot settings — /settings' },
  { command: 'mute', description: 'Pause alert notifications — /mute' },
  { command: 'unmute', description: 'Resume alert notifications — /unmute' },
  { command: 'unlink', description: 'Disconnect this Telegram chat — /unlink' },
  { command: 'help', description: 'All commands — /help' },
];

export function helpReply(): BotReply {
  const keyboard = new InlineKeyboard()
    .text('📊 Gold price', 'cmd:price:XAUUSD')
    .text('🧠 Analyze', 'cmd:analyze:XAUUSD')
    .row()
    .text('📰 News', 'cmd:news')
    .text('📅 Calendar', 'cmd:calendar')
    .row()
    .text('💼 Positions', 'cmd:positions')
    .text('📈 Briefing', 'cmd:briefing');
  return {
    text: [
      '🤖 Kestrel Telegram Copilot',
      '',
      ...COMMAND_DESCRIPTIONS.map((entry) => `/${entry.command} — ${entry.description}`),
      '',
      'You can also send a free-form market question.',
    ].join('\n'),
    keyboard,
  };
}
