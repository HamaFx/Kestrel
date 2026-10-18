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

// F7 — /ask command: free-form question to the AI in simple trader language.
// /ask is gold bullish? → runs the AI agent with live market context when a symbol is detected.

import { createHash, randomUUID } from 'crypto';

import { withRateLimit } from '@kestrel/db';
import type { UIMessage } from 'ai';

import { tryMastraBotMessage } from '../mastra';
import type { BotCommand, BotContext, BotResponse } from '../types';

export const askCommand: BotCommand = {
  name: 'ask',
  aliases: ['q'],
  description: 'Ask a market question: /ask <question>',
  handler: async (args: string[], ctx: BotContext): Promise<BotResponse> => {
    if (args.length === 0) {
      return {
        text: 'Usage: /ask <question>\nExample: /ask is gold bullish right now?',
      };
    }

    const question = args.join(' ');

    // Rate limit: 15 questions per minute per user
    const rateLimit = await withRateLimit(ctx.userId, 'bot_ask', 15);
    if (!rateLimit.allowed) {
      return {
        text: `⏳ Rate limit reached. You can use /ask ${rateLimit.limit} times per minute. Please wait a moment and try again.`,
      };
    }

    const userMessage: UIMessage = {
      id: randomUUID(),
      role: 'user',
      parts: [{ type: 'text', text: question }],
    };

    try {
      const threadId = deterministicThreadId(ctx.userId, 'ask');

      const replyText = await tryMastraBotMessage({
        userId: ctx.userId,
        threadId,
        userMessage,
        prompt: question,
        instructions:
          'You are Kestrel answering a trader on Telegram. Explain clearly in simple, everyday language with zero technical jargon. Use only supplied or freshly retrieved market data, keep it concise, and never place trades.',
        ...(ctx.signal ? { signal: ctx.signal } : {}),
      });
      return {
        text:
          replyText ?? 'Could not complete your question right now. Please try again in a moment.',
      };
    } catch {
      return {
        text: 'Your question could not be processed right now. Please try again later.',
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
