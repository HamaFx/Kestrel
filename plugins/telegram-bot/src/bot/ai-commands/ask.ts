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

// /ask — free-form chat over verified market context.

import { randomUUID } from 'node:crypto';

import { getUserWithSettings } from '@kestrel/db';
import type { UIMessage } from 'ai';

import type { BotReply, TelegramBotContext } from '../types';
import {
  analysisTimeout,
  checkRate,
  deterministicThreadId,
  modelEnv,
  persistTelegramTurnBestEffort,
} from './shared';

export async function askReply(question: string, ctx: TelegramBotContext): Promise<BotReply> {
  if (!question.trim()) {
    return { text: 'Usage: /ask <question>\nExample: /ask is gold bullish right now?' };
  }
  if (!checkRate(ctx.userId, 'telegram_ask', 15)) {
    return { text: '⏳ Too many questions. Please wait a minute and try again.' };
  }

  const userMessage: UIMessage = {
    id: randomUUID(),
    role: 'user',
    parts: [{ type: 'text', text: question }],
  };
  const threadId = deterministicThreadId(ctx.userId, 'telegram-ask');

  try {
    const {
      collectSymbolResearchPacket,
      extractSymbolFromPrompt,
      runMastraBackgroundText,
      serializeSymbolResearchPacket,
    } = await import('@kestrel/ai/mastra-v2');
    const { settings } = await getUserWithSettings(ctx.userId);
    if (!settings) return { text: 'Your Kestrel settings are unavailable right now.' };

    let prompt = question;
    const symbol = extractSymbolFromPrompt(question);
    if (symbol) {
      const packet = await collectSymbolResearchPacket(symbol);
      if (packet.status !== 'ready') {
        return {
          text: `Market data for ${symbol} is unavailable right now. I cannot answer without verified prices.`,
        };
      }
      prompt = [
        question,
        '',
        'Live market snapshot (use only these verified numbers):',
        serializeSymbolResearchPacket(packet),
      ].join('\n');
    }

    const result = await runMastraBackgroundText({
      userId: ctx.userId,
      threadId,
      task: 'bot',
      prompt,
      instructions:
        'You are Kestrel answering a trader on Telegram. Use only verified market data, write in plain English with no internal jargon, use scenario language, and never place trades.',
      settings,
      env: modelEnv(),
      signal: analysisTimeout(ctx),
      readOnlyTools: true,
    });

    if (!result.text.trim()) return { text: 'I could not answer that right now. Please retry.' };

    const reply: BotReply = { text: result.text };
    reply.afterSend = () =>
      persistTelegramTurnBestEffort({
        userId: ctx.userId,
        threadId,
        title: question.slice(0, 80),
        symbol,
        userMessage,
        assistantMessage: {
          id: randomUUID(),
          role: 'assistant',
          parts: [{ type: 'text', text: result.text }],
        },
      });
    return reply;
  } catch (err) {
    return {
      text: `Your question could not be processed right now: ${
        err instanceof Error ? err.message : 'please try again later'
      }`,
    };
  }
}
