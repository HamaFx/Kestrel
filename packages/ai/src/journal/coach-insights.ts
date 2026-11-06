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
import type { JournalEntry, ServerEnv } from '@kestrel/shared';
import { createCategorizedLogger } from '@kestrel/shared/logger';

import { sanitizeExternalText } from '../mastra-v2/packets/external-content';
import { runMastraBackgroundText } from '../mastra-v2/shared/background-text';
import {
  CoachInsightsOutputSchema,
  CoachInsightsUnavailableError,
  parseCoachPayload,
} from './coach-insights-schema';
import { syncCoachInsightsToWorkingMemory } from './coach-working-memory';
import { computeStats, listEntries, type JournalStatsSummary } from './persistence';

// R13 (audit 2026-10-31): the schema, content caps, and model-output
// normalization live in `./coach-insights-schema`; re-exported here so the
// existing public surface is unchanged.
export { CoachInsightsUnavailableError } from './coach-insights-schema';

export interface CoachInsightsArgs {
  userId: string;
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

function formatStatsForCoachPrompt(stats: JournalStatsSummary, entries: JournalEntry[]): string {
  // A null metric was not measured. Print "n/a" so the model cannot quote a
  // fabricated 0 (R8, audit 2026-10-31).
  const pct = (v: number | null): string => (v === null ? 'n/a' : `${(v * 100).toFixed(0)}%`);
  const r1 = (v: number | null): string => (v === null ? 'n/a' : `${v.toFixed(1)}R`);
  const r2 = (v: number | null): string => (v === null ? 'n/a' : v.toFixed(2));
  const orDash = (v: number | null): string => (v === null ? 'no sample' : `${v}`);

  const recentNotes = entries
    .filter((e) => e.notes && e.notes.trim().length > 0)
    .slice(0, 10)
    .map(
      (e) =>
        `- [${e.symbol} ${e.side.toUpperCase()}] Outcome: ${e.outcome}, R: ${e.rMultiple ?? 'N/A'}, Tags: [${e.tags.map((t) => sanitizeExternalText(t, 50)).join(', ')}], Notes: "${sanitizeExternalText(e.notes, 500)}"`,
    )
    .join('\n');

  const symbolsSummary = (stats.bySymbol ?? [])
    .map(
      (s) =>
        `  - ${s.symbol}: ${s.trades} trades, ${pct(s.winRate)} win rate, Total R: ${r1(s.totalR)}, Exp: ${r2(s.expectancy)}`,
    )
    .join('\n');

  const sessionsSummary = (stats.bySession ?? [])
    .map(
      (s) =>
        `  - ${s.session}: ${s.trades} trades, ${pct(s.winRate)} win rate, Total R: ${r1(s.totalR)}`,
    )
    .join('\n');

  const daysSummary = (stats.byDayOfWeek ?? [])
    .map(
      (d) =>
        `  - ${d.day}: ${d.trades} trades, ${pct(d.winRate)} win rate, Total R: ${r1(d.totalR)}`,
    )
    .join('\n');

  return `
Aggregate Journal Statistics:
- Total Trades: ${stats.count} (Closed: ${stats.wins + stats.losses + stats.breakevens}, Open: ${stats.open})
- Wins: ${stats.wins}, Losses: ${stats.losses}, Breakevens: ${stats.breakevens}
- Win Rate: ${stats.winRate === null ? 'n/a (no closed trades)' : `${(stats.winRate * 100).toFixed(1)}%`}
- Avg Realized R: ${stats.avgR === null ? 'n/a (no R multiples)' : `${stats.avgR.toFixed(2)}R`} (Win Avg: ${orDash(stats.avgWinR)}, Loss Avg: ${orDash(stats.avgLossR)})
- Total Realized R: ${stats.totalR === null ? 'n/a (no R multiples)' : `${stats.totalR.toFixed(2)}R`}
- Profit Factor: ${stats.profitFactor === null ? 'n/a' : stats.profitFactor.toFixed(2)}
- Max Drawdown: ${stats.maxDrawdown === null ? 'n/a (no R multiples)' : `${stats.maxDrawdown.toFixed(2)}R`}
- Streaks: Best Win Streak: ${stats.maxWinStreak ?? stats.longestWinStreak ?? 0}, Worst Loss Streak: ${stats.maxLossStreak ?? stats.longestLossStreak ?? 0}
- Current Streak: ${stats.currentStreak ? `${stats.currentStreak.count} ${stats.currentStreak.type}(s)` : 'None'}
- Avg Hold Time: ${stats.avgHoldMs === null ? 'n/a' : `${Math.round(stats.avgHoldMs / 60000)} mins`}

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
  const threadId = `journal-coach:${userId}`;

  const [stats, entries] = await Promise.all([
    computeStats(userId),
    listEntries(userId, { limit: 50 }),
  ]);
  const userPrompt = formatStatsForCoachPrompt(stats, entries);

  const result = await runMastraBackgroundText({
    userId,
    threadId,
    task: 'journal_review',
    prompt: userPrompt,
    instructions: COACH_SYSTEM_PROMPT,
    settings: userSettings,
    env,
    estimateUsd: 0.008,
    structuredSchema: CoachInsightsOutputSchema,
    structuredInstructions: 'Return only the coach insights JSON object.',
    ...(signal ? { signal } : {}),
  });

  // R13 (audit 2026-10-31): validate before anything is recorded as a
  // completed review. A malformed response is never rewritten into a
  // fabricated summary or stored as raw model prose.
  const payload = parseCoachPayload(result.text, result.object);
  if (!payload) {
    clog.warn(
      {
        runId: result.runId,
        rawTextLength: result.text.length,
        rawPreview: result.text.slice(0, 200),
      },
      'Coach review rejected: model output failed schema validation',
    );
    throw new CoachInsightsUnavailableError();
  }

  const insights: CoachInsightsResult = {
    ...payload,
    modelId: result.modelId,
    costUsd: result.costUsd,
    latencyMs: result.latencyMs,
  };

  // Phase 3 — mirror the quantitative edge and behavioral leaks into Mastra's
  // resource-scoped working memory so chat turns are aware of the trader's
  // personal profile. Best-effort: a memory failure is logged and never fails
  // the review response.
  const coachMemorySyncArgs = { userId, threadId, userSettings, env, insights, stats };
  await syncCoachInsightsToWorkingMemory(coachMemorySyncArgs);

  return insights;
}
