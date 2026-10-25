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

// /ask — free-form chat and standalone custom-agent (@handle) dispatch.

import { randomUUID } from 'node:crypto';

import { getUserWithSettings } from '@kestrel/db';
import type { UIMessage } from 'ai';

import type { BotReply, TelegramBotContext } from '../types';
import { analysisTimeout, checkRate, deterministicThreadId, modelEnv } from './shared';

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

    // ── Standalone custom agent (`@handle`) ──────────────────────────────
    const {
      getInstalledPluginRuntime,
      hasUserAgentCatalogs,
      parseCustomAgentMention,
      resolveUserCustomAgent,
      runCustomAgentText,
    } = await import('@kestrel/ai/plugins');
    const mention = parseCustomAgentMention(question);
    if (mention) {
      const runtime = await getInstalledPluginRuntime(ctx.userId);
      if (hasUserAgentCatalogs(runtime)) {
        const descriptor = await resolveUserCustomAgent(runtime, mention.slug);
        if (!descriptor) {
          return {
            text: `No custom agent @${mention.slug} was found. Open the Agent Studio in Kestrel to create it.`,
          };
        }
        if (!mention.prompt) {
          return { text: `Add a question after @${mention.slug}.` };
        }

        let contextPrefix: string | undefined;
        const mentionSymbol = extractSymbolFromPrompt(mention.prompt);
        if (mentionSymbol) {
          const packet = await collectSymbolResearchPacket(mentionSymbol);
          if (packet.status !== 'ready') {
            return {
              text: `Market data for ${mentionSymbol} is unavailable right now. I cannot answer without verified prices.`,
            };
          }
          contextPrefix = [
            'Live market snapshot (use only these verified numbers):',
            serializeSymbolResearchPacket(packet),
          ].join('\n');
        }

        const result = await runCustomAgentText({
          runtime,
          descriptor,
          settings,
          env: modelEnv(),
          userId: ctx.userId,
          threadId,
          prompt: mention.prompt,
          ...(contextPrefix ? { contextPrefix } : {}),
          signal: analysisTimeout(ctx),
        });
        if (!result.text.trim()) {
          return { text: `@${mention.slug} could not answer right now. Please retry.` };
        }

        const { appendAssistantMessage, appendUserMessage } = await import('@kestrel/ai');
        await appendUserMessage(ctx.userId, threadId, userMessage);
        await appendAssistantMessage(ctx.userId, threadId, {
          id: randomUUID(),
          role: 'assistant',
          parts: [{ type: 'text', text: result.text }],
        });
        return { text: result.text };
      }
    }

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
    });

    if (!result.text.trim()) return { text: 'I could not answer that right now. Please retry.' };

    const { appendAssistantMessage, appendUserMessage } = await import('@kestrel/ai');
    await appendUserMessage(ctx.userId, threadId, userMessage);
    await appendAssistantMessage(ctx.userId, threadId, {
      id: randomUUID(),
      role: 'assistant',
      parts: [{ type: 'text', text: result.text }],
    });

    return { text: result.text };
  } catch (err) {
    return {
      text: `Your question could not be processed right now: ${
        err instanceof Error ? err.message : 'please try again later'
      }`,
    };
  }
}
