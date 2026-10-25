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

// Shared helpers for the AI-backed Telegram commands: rate limiting,
// deterministic thread ids, model env and analysis formatting.

import { createHash } from 'node:crypto';

import type { TelegramBotContext } from '../types';

export const AI_TIMEOUT_MS = 90_000;

interface RateEntry {
  count: number;
  windowStart: number;
}

const rateLimits = new Map<string, RateEntry>();
const RATE_WINDOW_MS = 60_000;

export function checkRate(userId: string, action: string, limit: number): boolean {
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

export function deterministicThreadId(...parts: string[]): string {
  const hash = createHash('sha256').update(parts.join('-')).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `8${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join('-');
}

export function modelEnv() {
  return {
    AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
    GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    AI_EMBEDDING_MODEL: process.env.AI_EMBEDDING_MODEL,
  };
}

export function analysisTimeout(ctx: TelegramBotContext): AbortSignal {
  const timeout = AbortSignal.timeout(AI_TIMEOUT_MS);
  return ctx.signal ? AbortSignal.any([ctx.signal, timeout]) : timeout;
}

const DESK_LABELS: Record<string, string> = {
  technical: '📈 Technical',
  fundamental: '🌍 Macro & News',
  risk: '🛡️ Risk',
  sentiment: '👥 Sentiment',
};

export function formatAnalysis(args: {
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
