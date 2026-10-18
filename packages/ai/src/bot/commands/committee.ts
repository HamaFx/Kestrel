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

// F7+ — /committee command: run the 4-expert team analysis on a symbol (or quick check if chosen).
// /committee XAUUSD [full|quick] → runs the 4-expert team (Technical, Macro & News, Risk, Sentiment).

import { createHash, randomUUID } from 'crypto';

import type { UIMessage } from 'ai';

import { checkRateLimit } from '../../telegram/rate-limiter';
import {
  parseTelegramAnalysisMode,
  runTelegramSymbolAnalysis,
  tryMastraBotMessage,
} from '../mastra';
import type { BotCommand, BotContext, BotResponse } from '../types';
import { buildModeToggleKeyboard } from './analyze';

export const committeeCommand: BotCommand = {
  name: 'committee',
  aliases: ['comm'],
  description: '4-Expert team analysis: /committee <symbol> [full|quick]',
  handler: async (args: string[], ctx: BotContext): Promise<BotResponse> => {
    const symbolStr = args[0];
    if (!symbolStr) {
      return {
        text: [
          'Usage: /committee <symbol> [full|quick]',
          'Example: /committee XAUUSD',
          '',
          'Brings together all 4 Kestrel experts (Technical, Macro & News, Risk Manager, and Market Sentiment) to debate and give you one clear, plain-English game plan.',
          '• /committee XAUUSD full — 🧠 Full 4-Expert Team Analysis (default)',
          '• /committee XAUUSD quick — ⚡ Quick Check (1 Expert)',
          '⚠️ Rate limited to 3 runs per hour.',
        ].join('\n'),
      };
    }

    const symbol = symbolStr.toUpperCase();
    const chosenMode =
      parseTelegramAnalysisMode(args[1]) ?? parseTelegramAnalysisMode(args[2]) ?? 'full';

    // Aggressive rate limit: 3 per hour per user
    const rateLimit = checkRateLimit(ctx.userId, 'bot_committee', 3);
    if (!rateLimit.allowed) {
      const minutes = Math.ceil(rateLimit.resetMs / 60000);
      return {
        text: `⏳ Team analysis rate limit reached (3/hour). Please wait ~${minutes}min, or use /analyze ${symbol} quick for a faster 1-expert check.`,
      };
    }

    const userMessage: UIMessage = {
      id: randomUUID(),
      role: 'user',
      parts: [
        {
          type: 'text',
          text: `Run a ${chosenMode === 'full' ? 'full 4-expert team' : 'quick 1-expert'} analysis of ${symbol} in simple trader language.`,
        },
      ],
    };

    try {
      const threadId = deterministicThreadId(ctx.userId, `committee-${symbol}-${chosenMode}`);

      let text: string | null = null;
      try {
        text = await runTelegramSymbolAnalysis({
          userId: ctx.userId,
          threadId,
          userMessage,
          symbol,
          mode: chosenMode,
          ...(ctx.signal ? { signal: ctx.signal } : {}),
        });
      } catch {
        text = await tryMastraBotMessage({
          userId: ctx.userId,
          threadId,
          userMessage,
          prompt: `Run a ${chosenMode === 'full' ? '4-expert team' : 'quick'} analysis of ${symbol} in plain, everyday trader English. Cover where experts agree or disagree, key price levels, main risks, and when this idea is wrong.`,
          instructions:
            'You are Kestrel coordinating a plain-English expert team summary for a trader on Telegram. Use only verified market data, avoid internal technical jargon, use scenario language, and never place trades.',
          ...(ctx.signal ? { signal: ctx.signal } : {}),
        });
      }

      if (!text) {
        return {
          text: `Could not complete the team analysis of ${symbol} right now. Please try again in a moment.`,
        };
      }

      return {
        text,
        inlineKeyboard: buildModeToggleKeyboard(symbol, chosenMode),
      };
    } catch {
      return {
        text: 'The team analysis could not be completed right now. Please try again later.',
      };
    }
  },
};

function deterministicThreadId(...parts: string[]): string {
  const hash = createHash('sha256').update(parts.join('-')).digest('hex');
  return [
    hash.substring(0, 8),
    hash.substring(8, 12),
    '4' + hash.substring(13, 16),
    '8' + hash.substring(17, 20),
    hash.substring(20, 32),
  ].join('-');
}
