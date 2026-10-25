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

// Alert commands: /alert.

import { createAlert } from '@kestrel/db';
import { isKnownSymbol } from '@kestrel/shared';

import type { BotReply, TelegramBotContext } from '../types';

export async function alertReply(args: string[], ctx: TelegramBotContext): Promise<BotReply> {
  const [symbolRaw, operator, levelRaw] = args;
  if (!symbolRaw || !operator || !levelRaw) {
    return {
      text: [
        'Usage: /alert <symbol> <operator> <price>',
        'Operators: >, <, >=, <=',
        'Example: /alert XAUUSD > 2700',
      ].join('\n'),
    };
  }

  const symbol = symbolRaw.toUpperCase();
  if (!isKnownSymbol(symbol)) return { text: `Unknown symbol: ${symbol}` };

  const direction =
    operator === '>' || operator === '>='
      ? 'above'
      : operator === '<' || operator === '<='
        ? 'below'
        : null;
  const level = Number.parseFloat(levelRaw);
  if (!direction || !Number.isFinite(level)) {
    return { text: 'Invalid alert. Use /alert XAUUSD > 2700.' };
  }

  try {
    await createAlert({
      userId: ctx.userId,
      rule: { type: 'priceCross', symbol, level, direction },
      // `telegram-bot` is this plugin's own channel, so the alert is
      // delivered by the user's bot rather than the shared server bot.
      channels: ['telegram-bot'],
    });
    return {
      text: `✅ Alert created\n\n${symbol} ${direction === 'above' ? '↑ above' : '↓ below'} ${level}\n\nYou will be notified in this chat.`,
    };
  } catch (err) {
    return {
      text: `Could not create the alert: ${err instanceof Error ? err.message : 'unknown error'}`,
    };
  }
}
