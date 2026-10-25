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

// AI-backed Telegram commands.
//
// Everything Mastra-related is dynamically imported so plugin registration
// stays cheap. The handlers reuse Kestrel's canonical mode runner and
// background-text path rather than duplicating agent logic.

import { createHash, randomUUID } from 'node:crypto';

import { getUserWithSettings } from '@kestrel/db';
import type { UIMessage } from 'ai';
import { InlineKeyboard } from 'grammy';

import type { BotReply, TelegramBotContext } from './types';

const AI_TIMEOUT_MS = 90_000;

interface RateEntry {
  count: number;
  windowStart: number;
}

const rateLimits = new Map<string, RateEntry>();
const RATE_WINDOW_MS = 60_000;

function checkRate(userId: string, action: string, limit: number): boolean {
  const key = `${userId}:${action}`;
  const now = Date.now();
  const current = rateLimits.get(key);
  if (!current || now - current.windowStart >= RATE_WINDOW_MS) {
    rateLimits.set(key, { count: 1, windowStart: now });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

function deterministicThreadId(...parts: string[]): string {
  const hash = createHash('sha256').update(parts.join('-')).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `8${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join('-');
}

function modelEnv() {
  return {
    AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
    GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    AI_EMBEDDING_MODEL: process.env.AI_EMBEDDING_MODEL,
  };
}

function analysisTimeout(ctx: TelegramBotContext): AbortSignal {
  const timeout = AbortSignal.timeout(AI_TIMEOUT_MS);
  return ctx.signal ? AbortSignal.any([ctx.signal, timeout]) : timeout;
}

const DESK_LABELS: Record<string, string> = {
  technical: '📈 Technical',
  fundamental: '🌍 Macro & News',
  risk: '🛡️ Risk',
  sentiment: '👥 Sentiment',
};

function formatAnalysis(args: {
  symbol: string;
  mode: 'single' | 'full';
  finalText: string;
  opinions?: ReadonlyArray<{ agentName: string; bias: string; confidence: number }>;
}): string {
  const header =
    args.mode === 'full'
      ? `🧠 Full team analysis — ${args.symbol}`
      : `⚡ Quick check — ${args.symbol}`;
  const lines = [header];

  if (args.mode === 'full' && args.opinions && args.opinions.length > 0) {
    lines.push('', 'Desk breakdown');
    for (const opinion of args.opinions) {
      const label = DESK_LABELS[opinion.agentName] ?? opinion.agentName;
      lines.push(
        `• ${label}: ${opinion.bias} (${Math.round(opinion.confidence * 100)}% confidence)`,
      );
    }
  }

  lines.push('', args.finalText.trim());
  lines.push(
    '',
    args.mode === 'single'
      ? `Want the full team? /analyze ${args.symbol} full`
      : `Want a faster check? /analyze ${args.symbol} quick`,
  );
  return lines.join('\n');
}

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

export async function agentsReply(ctx: TelegramBotContext): Promise<BotReply> {
  try {
    const { getInstalledPluginRuntime, hasUserAgentCatalogs, listUserCustomAgents } =
      await import('@kestrel/ai/plugins');
    const runtime = await getInstalledPluginRuntime(ctx.userId);
    if (!hasUserAgentCatalogs(runtime)) {
      return {
        text: 'Custom Agents is not installed. Install it from Settings → Plugins in Kestrel, then create an agent in the Agent Studio.',
      };
    }
    const agents = await listUserCustomAgents(runtime);
    if (agents.length === 0) {
      return {
        text: 'You have no custom agents yet. Build one in Kestrel → Plugins → Custom Agents.',
      };
    }
    return {
      text: [
        '🧩 Your custom agents',
        '',
        ...agents.map((entry) => `@${entry.agent.slug} — ${entry.agent.name}`),
        '',
        'Ask one: /ask @handle your question',
      ].join('\n'),
    };
  } catch (err) {
    return {
      text: `Could not load your agents right now: ${
        err instanceof Error ? err.message : 'please retry later'
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
