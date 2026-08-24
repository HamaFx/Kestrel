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

import type { UserSettingsRow } from '@kestrel/db/schema';
import type { JournalEntry, JournalStats, ServerEnv } from '@kestrel/shared';
import { createCategorizedLogger } from '@kestrel/shared/logger';

import {
  DEFAULT_MAX_DAILY_USD,
  estimateKnownCostUsd,
  releaseBudgetReservation,
  tryReserveBudget,
} from '../cost';
import { runMastraText } from '../mastra/text-runner';
import { resolveChatModel } from '../model';
import { computeStats, listEntries } from './persistence';

export interface CoachInsightsArgs {
  userId: string;
  userSettings: UserSettingsRow;
  env: Pick<
    ServerEnv,
    | 'AI_GATEWAY_API_KEY'
    | 'GOOGLE_GENERATIVE_AI_API_KEY'
    | 'GOOGLE_VERTEX_PROJECT'
    | 'GOOGLE_VERTEX_LOCATION'
    | 'GOOGLE_APPLICATION_CREDENTIALS_JSON'
    | 'GOOGLE_APPLICATION_CREDENTIALS'
    | 'AI_DEFAULT_MODEL'
    | 'MAX_DAILY_USD'
    | 'LOG_PROMPTS'
  >;
  signal?: AbortSignal;
}

export interface CoachInsightsResult {
  summary: string;
  disciplineGrade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  strengths: string[];
  leaks: string[];
  actionRules: string[];
  modelId: string;
  costUsd: number;
  latencyMs: number;
}

const clog = createCategorizedLogger('ai', { component: 'journal-coach' });

const COACH_SYSTEM_PROMPT = `You are a high-performance quantitative trading coach and psychologist reviewing aggregate trading performance data.

Your goal is to detect psychological leaks, statistical edges, and risk mismanagement patterns from the user's trade history and analytics.

You will receive aggregated statistics:
- Total trades, win rate, profit factor, average R, total R, max drawdown
- Longest win/loss streaks and current streak
- Breakdown by Symbol, Session (Asian, London, New York), Day of Week, and Hour
- Notes and tags from recent trades

Analyze the data and provide your evaluation strictly in the following JSON format:
{
  "disciplineGrade": "A+" | "A" | "B" | "C" | "D" | "F",
  "summary": "2-3 sentences summarizing the trader's edge, style, and overall consistency.",
  "strengths": [
    "Top statistical strength with numbers (e.g. 75% win rate during London session on XAUUSD)",
    "Process strength (e.g. Consistent 1:2 R:R target adherence)"
  ],
  "leaks": [
    "Top behavioral or risk leak with evidence (e.g. Heavy losses on Fridays or oversized stop losses on EURUSD)",
    "Second leak or vulnerability (e.g. Moving stops or overtrading after loss streaks)"
  ],
  "actionRules": [
    "Golden Rule 1: Specific, non-negotiable rule for next week",
    "Golden Rule 2: Risk or session management rule",
    "Golden Rule 3: Trade execution / psychology focus"
  ]
}

Rules:
- Output ONLY valid, parseable JSON matching the schema above.
- No surrounding markdown backticks (no \`\`\`json).
- Be direct, data-driven, and actionable. Never give generic platitudes.
- If fewer than 5 trades exist, note that sample size is small while still providing process guidance.`;

function formatStatsForCoachPrompt(stats: JournalStats, entries: JournalEntry[]): string {
  const recentNotes = entries
    .filter((e) => e.notes && e.notes.trim().length > 0)
    .slice(0, 10)
    .map(
      (e) =>
        `- [${e.symbol} ${e.side.toUpperCase()}] Outcome: ${e.outcome}, R: ${e.rMultiple ?? 'N/A'}, Tags: [${e.tags.join(', ')}], Notes: "${e.notes}"`,
    )
    .join('\n');

  const symbolsSummary = (stats.bySymbol ?? [])
    .map(
      (s) =>
        `  - ${s.symbol}: ${s.trades} trades, ${(s.winRate * 100).toFixed(0)}% win rate, Total R: ${s.totalR.toFixed(1)}R, Exp: ${s.expectancy.toFixed(2)}`,
    )
    .join('\n');

  const sessionsSummary = (stats.bySession ?? [])
    .map(
      (s) =>
        `  - ${s.session}: ${s.trades} trades, ${(s.winRate * 100).toFixed(0)}% win rate, Total R: ${s.totalR.toFixed(1)}R`,
    )
    .join('\n');

  const daysSummary = (stats.byDayOfWeek ?? [])
    .map(
      (d) =>
        `  - ${d.day}: ${d.trades} trades, ${(d.winRate * 100).toFixed(0)}% win rate, Total R: ${d.totalR.toFixed(1)}R`,
    )
    .join('\n');

  return `
Aggregate Journal Statistics:
- Total Trades: ${stats.count} (Closed: ${stats.wins + stats.losses + stats.breakevens}, Open: ${stats.open})
- Wins: ${stats.wins}, Losses: ${stats.losses}, Breakevens: ${stats.breakevens}
- Win Rate: ${(stats.winRate * 100).toFixed(1)}%
- Avg Realized R: ${stats.avgR.toFixed(2)}R (Win Avg: +${(stats.avgWinR ?? 0).toFixed(2)}R, Loss Avg: ${(stats.avgLossR ?? 0).toFixed(2)}R)
- Total Realized R: ${stats.totalR.toFixed(2)}R
- Profit Factor: ${stats.profitFactor !== null && stats.profitFactor !== undefined ? stats.profitFactor.toFixed(2) : 'N/A'}
- Max Drawdown: ${(stats.maxDrawdown ?? 0).toFixed(2)}R
- Streaks: Best Win Streak: ${stats.maxWinStreak ?? stats.longestWinStreak ?? 0}, Worst Loss Streak: ${stats.maxLossStreak ?? stats.longestLossStreak ?? 0}
- Current Streak: ${stats.currentStreak ? `${stats.currentStreak.count} ${stats.currentStreak.type}(s)` : 'None'}
- Avg Hold Time: ${stats.avgHoldMs ? `${Math.round(stats.avgHoldMs / 60000)} mins` : 'N/A'}

Performance by Symbol:
${symbolsSummary || '  - None recorded'}

Performance by Session:
${sessionsSummary || '  - None recorded'}

Performance by Day of Week:
${daysSummary || '  - None recorded'}

Recent Trade Notes & Execution Observations:
${recentNotes || '- No trade notes recorded yet.'}
`.trim();
}

export async function getCoachInsights(args: CoachInsightsArgs): Promise<CoachInsightsResult> {
  const { userId, userSettings, env, signal } = args;
  const startedAt = Date.now();

  const { model, modelId } = resolveChatModel(userSettings, env);

  const estimatedUsd = 0.008;
  const maxDailyUsd = userSettings.maxDailyUsd ?? env.MAX_DAILY_USD ?? DEFAULT_MAX_DAILY_USD;
  const reservation = await tryReserveBudget(userId, estimatedUsd, maxDailyUsd, new Date(), {
    runId: crypto.randomUUID(),
  });
  if (!reservation.ok) {
    throw new Error(
      `Daily AI budget exceeded ($${reservation.spent.toFixed(2)} / $${reservation.max.toFixed(2)}).`,
    );
  }

  try {
    const [stats, entries] = await Promise.all([
      computeStats(userId),
      listEntries(userId, { limit: 50 }),
    ]);

    const userPrompt = formatStatsForCoachPrompt(stats, entries);

    const result = await runMastraText({
      task: 'journal-review',
      model,
      system: COACH_SYSTEM_PROMPT,
      prompt: userPrompt,
      userId,
      ...(signal ? { signal } : {}),
      maxOutputTokens: 1200,
    });

    const latencyMs = Date.now() - startedAt;
    const costUsd = estimateKnownCostUsd(modelId, result.inputTokens, result.outputTokens);
    if (reservation.reservationId) {
      const { reconcileBudgetReservation } = await import('../cost');
      await reconcileBudgetReservation(reservation.reservationId, costUsd);
    }

    let parsed: {
      disciplineGrade?: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
      summary?: string;
      strengths?: string[];
      leaks?: string[];
      actionRules?: string[];
    } = {};

    try {
      const cleaned = result.text
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      clog.warn(
        { err: parseErr, rawText: result.text },
        'Failed to parse structured coach JSON, using fallback formatting',
      );
      parsed = {
        disciplineGrade: stats.winRate >= 0.6 ? 'A' : stats.winRate >= 0.45 ? 'B' : 'C',
        summary: result.text.slice(0, 300),
        strengths: ['Consistent trade journaling discipline'],
        leaks: ['Review trade notes and risk parameters'],
        actionRules: ['Stick to 1% risk per trade', 'Review setups before market open'],
      };
    }

    return {
      summary: parsed.summary ?? 'Performance evaluation completed based on recent journal data.',
      disciplineGrade: parsed.disciplineGrade ?? 'B',
      strengths: parsed.strengths ?? ['Consistent logging'],
      leaks: parsed.leaks ?? ['Manage risk per trade'],
      actionRules: parsed.actionRules ?? [
        'Maintain strict stop-loss rules',
        'Trade high-probability sessions',
      ],
      modelId,
      costUsd,
      latencyMs,
    };
  } catch (err) {
    try {
      if (reservation.reservationId) {
        await releaseBudgetReservation(reservation.reservationId);
      } else {
        // Legacy reservations without a ledger id are not expected in production.
        // Keep the fallback path only for compatibility with older test adapters.
        const { applyBudgetDelta } = await import('../cost');
        await applyBudgetDelta(userId, -estimatedUsd);
      }
    } catch (releaseErr) {
      clog.error({ err: releaseErr }, 'journal budget release failed; reservation remains open');
    }
    throw err;
  }
}
