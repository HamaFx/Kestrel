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

// 2.3 — AI trade review for closed journal entries.
// Generates a concise post-trade review using an LLM. The review is
// deterministic in format (markdown) and scoped to the entry + recent
// journal stats so the model can compare this trade to the user's baseline.

import type { UserSettingsRow } from '@kestrel/db/schema';
import type { JournalEntry, ServerEnv } from '@kestrel/shared';

import { sanitizeExternalText } from '../mastra-v2/packets/external-content';
import { runMastraBackgroundText } from '../mastra-v2/shared/background-text';
import { computeStats, type JournalStatsSummary } from './persistence';

export interface ReviewTradeArgs {
  userId: string;
  entry: JournalEntry;
  userSettings: UserSettingsRow;
  env: Pick<
    ServerEnv,
    | 'AI_GATEWAY_API_KEY'
    | 'GOOGLE_GENERATIVE_AI_API_KEY'
    | 'AI_DEFAULT_MODEL'
    | 'MAX_DAILY_USD'
    | 'LOG_PROMPTS'
  >;
  signal?: AbortSignal;
}

export interface TradeReviewResult {
  review: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
}

const SYSTEM_PROMPT = `You are a disciplined trading coach reviewing a single closed trade from the user's journal.

Output a concise post-trade review in markdown with exactly these sections:

1. **What happened** — one sentence summarizing the setup, entry, stop, target, and outcome.
2. **Execution grade (A-F)** — grade the execution, not the outcome. Explain in one bullet.
3. **Risk management** — comment on stop placement, position size (if known), and R-multiple realized.
4. **Edge & process** — note whether the trade followed a repeatable setup, any emotional/deviation signals from the notes, and what to keep or change.
5. **One action item** — a single, specific improvement for the next similar trade.

Rules:
- Be direct and specific. No generic platitudes.
- If notes are empty, say "No notes recorded" and focus on the numbers.
- Never give financial advice; this is a review of a completed trade.
- Keep the total response under 250 words.`;

function formatEntryForPrompt(entry: JournalEntry, stats: JournalStatsSummary): string {
  const lines = [
    `Symbol: ${entry.symbol}`,
    `Side: ${entry.side}`,
    `Opened: ${new Date(entry.openedAt).toISOString()}`,
    `Entry: ${entry.entry}`,
    `Stop: ${entry.stop ?? 'none'}`,
    `Target: ${entry.target ?? 'none'}`,
    `Exit: ${entry.exit ?? 'unknown'}`,
    `Outcome: ${entry.outcome}`,
    `R-multiple: ${entry.rMultiple ?? 'unknown'}`,
    `Size (lots): ${entry.size ?? 'unknown'}`,
    `Tags: ${entry.tags.length > 0 ? entry.tags.map((t) => sanitizeExternalText(t, 50)).join(', ') : 'none'}`,
    `Notes: ${entry.notes ? sanitizeExternalText(entry.notes, 500) : 'none'}`,
    '',
    `User baseline (last closed trades):`,
    // A null baseline was not measured; say so instead of printing 0.
    `- Win rate: ${stats.winRate === null ? 'not measured yet' : `${(stats.winRate * 100).toFixed(1)}%`}`,
    `- Average R: ${stats.avgR === null ? 'not measured yet' : stats.avgR.toFixed(2)}`,
    `- Total R: ${stats.totalR === null ? 'not measured yet' : stats.totalR.toFixed(2)}`,
    `- Best trade: +${(stats.maxWinStreak ?? 0).toFixed(2)}R streak count shown; extremes not available in stats`,
  ];
  return lines.join('\n');
}

export async function reviewTrade(args: ReviewTradeArgs): Promise<TradeReviewResult> {
  const { userId, entry, userSettings, env, signal } = args;
  const threadId = `journal-review:${entry.id}`;

  if (entry.outcome === 'open') {
    throw new Error('Cannot review an open trade; close it first.');
  }

  const stats = await computeStats(userId);
  const userPrompt = formatEntryForPrompt(entry, stats);
  const result = await runMastraBackgroundText({
    userId,
    threadId,
    task: 'journal_review',
    prompt: userPrompt,
    instructions: SYSTEM_PROMPT,
    settings: userSettings,
    env,
    estimateUsd: 0.005,
    ...(signal ? { signal } : {}),
  });

  return {
    review: result.text.trim(),
    modelId: result.modelId,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: result.costUsd,
    latencyMs: result.latencyMs,
  };
}
