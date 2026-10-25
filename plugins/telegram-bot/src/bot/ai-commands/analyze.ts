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

// /analyze and /committee — the 4-desk committee runner.

import { randomUUID } from 'node:crypto';

import { getUserWithSettings } from '@kestrel/db';
import type { UIMessage } from 'ai';
import { InlineKeyboard } from 'grammy';

import type { BotReply, TelegramBotContext } from '../types';
import {
  analysisTimeout,
  checkRate,
  deterministicThreadId,
  formatAnalysis,
  modelEnv,
} from './shared';

export async function analyzeReply(
  symbolRaw: string | undefined,
  modeRaw: string | undefined,
  ctx: TelegramBotContext,
): Promise<BotReply> {
  if (!symbolRaw) {
    return {
      text: [
        'Usage: /analyze <symbol> [quick|full]',
        '',
        '• /analyze XAUUSD quick — ⚡ one technical expert',
        '• /analyze XAUUSD full — 🧠 the full 4-desk committee',
      ].join('\n'),
    };
  }

  const symbol = symbolRaw.trim().toUpperCase();
  if (!checkRate(ctx.userId, 'telegram_analyze', 10)) {
    return { text: '⏳ Too many analyses. Please wait a minute and try again.' };
  }

  const mode: 'single' | 'full' =
    modeRaw === 'full' || modeRaw === 'team' || modeRaw === '4' ? 'full' : 'single';

  const userMessage: UIMessage = {
    id: randomUUID(),
    role: 'user',
    parts: [
      {
        type: 'text',
        text:
          mode === 'full'
            ? `Run a full 4-expert team analysis of ${symbol} in plain English.`
            : `Run a quick technical check of ${symbol} in plain English.`,
      },
    ],
  };
  const threadId = deterministicThreadId(ctx.userId, `telegram-analyze-${symbol}-${mode}`);

  try {
    const { runMastraMode } = await import('@kestrel/ai/mastra-v2');
    const { settings } = await getUserWithSettings(ctx.userId);
    if (!settings) return { text: 'Your Kestrel settings are unavailable right now.' };

    const result = await runMastraMode({
      prompt:
        mode === 'full'
          ? `Provide a complete 4-expert team analysis for ${symbol} in simple, everyday trader language. Cover the bottom line, key levels, main drivers, and what would invalidate the view.`
          : `Provide a quick technical check for ${symbol} in simple, everyday trader language. Cover the bottom line, key levels to watch, and what would invalidate the setup.`,
      symbol,
      userId: ctx.userId,
      threadId,
      runId: randomUUID(),
      mode,
      settings,
      env: modelEnv(),
      signal: analysisTimeout(ctx),
    });

    if (!result.finalText?.trim()) {
      return { text: `Could not complete the analysis of ${symbol}. Please try again.` };
    }

    const text = formatAnalysis({
      symbol,
      mode,
      finalText: result.finalText,
      opinions: result.agentOpinions,
    });

    const { appendAssistantMessage, appendUserMessage } = await import('@kestrel/ai');
    await appendUserMessage(ctx.userId, threadId, userMessage);
    await appendAssistantMessage(ctx.userId, threadId, {
      id: randomUUID(),
      role: 'assistant',
      parts: [{ type: 'text', text }],
    });

    return {
      text,
      keyboard: new InlineKeyboard().text(
        mode === 'single' ? '🧠 Run full team' : '⚡ Run quick check',
        `analyze:${mode === 'single' ? 'full' : 'quick'}:${symbol}`,
      ),
    };
  } catch (err) {
    return {
      text: `Analysis could not be completed right now: ${
        err instanceof Error ? err.message : 'please try again later'
      }`,
    };
  }
}

export async function committeeReply(
  symbolRaw: string | undefined,
  modeRaw: string | undefined,
  ctx: TelegramBotContext,
): Promise<BotReply> {
  if (!symbolRaw) {
    return {
      text: [
        'Usage: /committee <symbol> [full|quick]',
        'Example: /committee XAUUSD',
        '',
        'The full team brings together Technical, Macro & News, Risk, and Sentiment.',
      ].join('\n'),
    };
  }
  const mode = modeRaw === 'quick' || modeRaw === 'single' ? 'single' : 'full';
  return analyzeReply(symbolRaw, mode, ctx);
}
