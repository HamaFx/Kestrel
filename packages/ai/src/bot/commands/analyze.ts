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

// F7 — /analyze command: AI market analysis of a symbol with user-choosable mode (Q9).
// /analyze XAUUSD [quick|full] → runs Quick Check (1 Expert) or Full Team Analysis (4 Experts).

import { createHash, randomUUID } from 'crypto';

import { withRateLimit } from '@kestrel/db';
import type { UIMessage } from 'ai';

import {
  parseTelegramAnalysisMode,
  runTelegramSymbolAnalysis,
  tryMastraBotMessage,
} from '../mastra';
import type { BotCommand, BotContext, BotInlineButton, BotResponse } from '../types';

export function buildModeToggleKeyboard(
  symbol: string,
  currentMode: 'single' | 'full',
): BotInlineButton[][] {
  if (currentMode === 'single') {
    return [
      [
        {
          text: '🧠 Run Full 4-Expert Team Analysis',
          callback_data: `analyze:full:${symbol}`,
        },
      ],
    ];
  }
  return [
    [
      {
        text: '⚡ Run Quick Check (1 Expert)',
        callback_data: `analyze:quick:${symbol}`,
      },
    ],
  ];
}

export const analyzeCommand: BotCommand = {
  name: 'analyze',
  aliases: ['a'],
  description: 'Market check (1 or 4 experts): /analyze <symbol> [quick|full]',
  handler: async (args: string[], ctx: BotContext): Promise<BotResponse> => {
    const symbolStr = args[0];
    if (!symbolStr) {
      return {
        text: [
          'Usage: /analyze <symbol> [quick|full]',
          '',
          'Choose your analysis depth:',
          '• /analyze XAUUSD quick — ⚡ Quick Check (1 Expert: Technical chart check)',
          '• /analyze XAUUSD full — 🧠 Full Team (4 Experts: Technical, Macro & News, Risk, and Sentiment)',
        ].join('\n'),
      };
    }
    const symbol = symbolStr.toUpperCase();

    // Support "/analyze XAUUSD full" or "/analyze XAUUSD 1h full"
    const parsedMode =
      parseTelegramAnalysisMode(args[1]) ?? parseTelegramAnalysisMode(args[2]) ?? 'single';

    // Rate limit: 10 analyses per minute per user
    const rateLimit = await withRateLimit(ctx.userId, 'bot_analyze', 10);
    if (!rateLimit.allowed) {
      return {
        text: `⏳ Rate limit reached. You can run /analyze ${rateLimit.limit} times per minute. Please wait a moment and try again.`,
      };
    }

    const userMessage: UIMessage = {
      id: randomUUID(),
      role: 'user',
      parts: [
        {
          type: 'text',
          text:
            parsedMode === 'full'
              ? `Run a full 4-expert team analysis of ${symbol} in simple language.`
              : `Run a quick 1-expert check of ${symbol} in simple language.`,
        },
      ],
    };

    try {
      const threadId = deterministicThreadId(ctx.userId, `analyze-${symbol}-${parsedMode}`);

      let analysisText: string | null = null;
      try {
        analysisText = await runTelegramSymbolAnalysis({
          userId: ctx.userId,
          threadId,
          userMessage,
          symbol,
          mode: parsedMode,
          ...(ctx.signal ? { signal: ctx.signal } : {}),
        });
      } catch {
        // Fallback to live-packet grounded bot message if the full workflow cannot run
        analysisText = await tryMastraBotMessage({
          userId: ctx.userId,
          threadId,
          userMessage,
          prompt: `Provide a ${parsedMode === 'full' ? 'full 4-expert' : 'quick'} market analysis of ${symbol} in simple, everyday trader language. Include the bottom line, key price levels, and main risks.`,
          instructions:
            'You are Kestrel helping a trader on Telegram. Use only verified market data, write in simple non-technical English, use scenario language, and never place trades.',
          ...(ctx.signal ? { signal: ctx.signal } : {}),
        });
      }

      if (!analysisText) {
        return {
          text: `Could not complete the analysis of ${symbol} right now. Please try again in a moment.`,
        };
      }

      return {
        text: analysisText,
        inlineKeyboard: buildModeToggleKeyboard(symbol, parsedMode),
      };
    } catch {
      return {
        text: 'Analysis could not be completed right now. Please try again later.',
      };
    }
  },
};

/** Generate a deterministic UUID from a string (for thread IDs). */
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
