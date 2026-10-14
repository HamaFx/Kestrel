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

import { getUserWithSettings } from '@kestrel/db';
import type { UIMessage } from 'ai';

import {
  collectSymbolResearchPacket,
  extractSymbolFromPrompt,
  runMastraBackgroundText,
  runMastraMode,
  serializeSymbolResearchPacket,
  type MastraAnalysisMode,
  type MastraModeOpinion,
} from '../mastra';
import { appendAssistantMessage, appendUserMessage } from '../persistence';
import type { ResolveModelEnv } from '../env-model-factory';

function botEnv(): ResolveModelEnv {
  return {
    AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
    GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    AI_EMBEDDING_MODEL: process.env.AI_EMBEDDING_MODEL,
  };
}

const DESK_PLAIN_LABELS: Record<string, string> = {
  technical: '📈 Technical Chartist',
  fundamental: '🌍 Macro & News',
  risk: '🛡️ Risk Manager',
  sentiment: '👥 Market Sentiment',
};

function formatBiasLabel(bias: 'bullish' | 'bearish' | 'neutral'): string {
  if (bias === 'bullish') return 'Bullish';
  if (bias === 'bearish') return 'Bearish';
  return 'Neutral';
}

/**
 * Parse a user-supplied mode flag (`quick`, `single`, `full`, `team`, `4`, `1`)
 * into a canonical `MastraAnalysisMode`.
 */
export function parseTelegramAnalysisMode(rawMode?: string): MastraAnalysisMode | null {
  if (!rawMode) return null;
  const normalized = rawMode.trim().toLowerCase();
  if (
    normalized === 'quick' ||
    normalized === 'single' ||
    normalized === 'fast' ||
    normalized === '1'
  ) {
    return 'single';
  }
  if (
    normalized === 'full' ||
    normalized === 'team' ||
    normalized === 'committee' ||
    normalized === '4'
  ) {
    return 'full';
  }
  return null;
}

/**
 * Format a completed symbol analysis in clear, plain-English trader language
 * (Decision Q9: no internal system jargon like "Mastra", "packetId", or "canonical").
 */
export function formatTelegramAnalysisReply(args: {
  symbol: string;
  mode: MastraAnalysisMode;
  finalText: string;
  agentOpinions?: ReadonlyArray<
    Pick<MastraModeOpinion, 'agentName' | 'bias' | 'confidence' | 'reasoning'>
  >;
}): string {
  const modeHeader =
    args.mode === 'full'
      ? `🧠 Full Team Analysis (4 Experts) — ${args.symbol}`
      : `⚡ Quick Check (1 Expert) — ${args.symbol}`;

  const sections: string[] = [modeHeader];

  if (args.mode === 'full' && args.agentOpinions && args.agentOpinions.length > 0) {
    const breakdownLines = args.agentOpinions.map((op) => {
      const label = DESK_PLAIN_LABELS[op.agentName] ?? op.agentName;
      const pct = Math.round(op.confidence * 100);
      return `• ${label}: ${formatBiasLabel(op.bias)} (${pct}% confidence)`;
    });
    sections.push(['Expert Team Breakdown:', ...breakdownLines].join('\n'));
  }

  sections.push(args.finalText.trim());

  const switchCmd =
    args.mode === 'single'
      ? `/analyze ${args.symbol} full`
      : `/analyze ${args.symbol} quick`;
  const switchLabel =
    args.mode === 'single'
      ? 'Full Team Analysis (4 Experts)'
      : 'Quick Check (1 Expert)';
  sections.push(`💡 Want a different depth? Tap the button below or send ${switchCmd} for ${switchLabel}.`);

  return sections.join('\n\n');
}

/**
 * Run a real multi-agent or single-expert symbol analysis for Telegram commands
 * (`/analyze` and `/committee`), backed by `runMastraMode` (live `SymbolResearchPacket`
 * + specialist desk tools + strict verification).
 */
export async function runTelegramSymbolAnalysis(args: {
  userId: string;
  threadId: string;
  userMessage: UIMessage;
  symbol: string;
  mode: MastraAnalysisMode;
  signal?: AbortSignal;
}): Promise<string | null> {
  const { settings } = await getUserWithSettings(args.userId);
  if (!settings) return null;

  const prompt =
    args.mode === 'full'
      ? `Provide a complete 4-expert team analysis for ${args.symbol} in simple, everyday trader language. Cover the bottom line, key price levels to watch, main drivers, and what would invalidate the view.`
      : `Provide a quick technical check for ${args.symbol} in simple, everyday trader language. Cover the bottom line, key price levels to watch, and what would invalidate the setup.`;

  const result = await runMastraMode({
    prompt,
    symbol: args.symbol,
    userId: args.userId,
    threadId: args.threadId,
    runId: crypto.randomUUID(),
    mode: args.mode,
    settings,
    env: botEnv(),
    ...(args.signal ? { signal: args.signal } : {}),
  });

  if (!result.finalText || result.finalText.trim().length === 0) {
    return null;
  }

  const formattedText = formatTelegramAnalysisReply({
    symbol: args.symbol,
    mode: args.mode,
    finalText: result.finalText,
    agentOpinions: result.agentOpinions,
  });

  await appendUserMessage(args.userId, args.threadId, args.userMessage);
  const assistant: UIMessage = {
    id: crypto.randomUUID(),
    role: 'assistant',
    parts: [{ type: 'text', text: formattedText }],
  };
  await appendAssistantMessage(args.userId, args.threadId, assistant);

  return formattedText;
}

/**
 * Run a free-form or `/ask` bot message through the Mastra path.
 * When a market symbol is mentioned in the user's question, automatically
 * collects a live `SymbolResearchPacket` so the answer is grounded in live
 * market data and explained in simple, non-technical language.
 */
export async function tryMastraBotMessage(args: {
  userId: string;
  threadId: string;
  userMessage: UIMessage;
  prompt: string;
  system: string;
  signal?: AbortSignal;
}): Promise<string | null> {
  const { settings } = await getUserWithSettings(args.userId);
  if (!settings) return null;

  let enrichedPrompt = args.prompt;
  const detectedSymbol = extractSymbolFromPrompt(args.prompt);
  if (detectedSymbol) {
    try {
      const packet = await collectSymbolResearchPacket(detectedSymbol);
      if (packet.status === 'ready') {
        enrichedPrompt = [
          args.prompt,
          '',
          'Live Market Data Snapshot (use only these verified numbers):',
          serializeSymbolResearchPacket(packet),
        ].join('\n');
      }
    } catch {
      // Proceed with the user's prompt if live packet collection is unavailable.
    }
  }

  // Generate before persisting so a failed attempt cannot leave a
  // duplicate user message.
  const result = await runMastraBackgroundText({
    userId: args.userId,
    threadId: args.threadId,
    task: 'bot',
    prompt: enrichedPrompt,
    system: `${args.system} Write in simple, plain English for everyday traders. Avoid internal technical jargon.`,
    settings,
    env: botEnv(),
    ...(args.signal ? { signal: args.signal } : {}),
  });
  if (result.text.length === 0) return null;

  await appendUserMessage(args.userId, args.threadId, args.userMessage);
  const assistant: UIMessage = {
    id: crypto.randomUUID(),
    role: 'assistant',
    parts: [{ type: 'text', text: result.text }],
  };
  await appendAssistantMessage(args.userId, args.threadId, assistant);
  return result.text;
}
