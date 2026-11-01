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

// R13 (audit 2026-10-31): coach insights are schema-validated before they can
// reach the UI or working memory. Malformed model output must produce a typed
// "unavailable" failure - never stored prose and never a fabricated summary.

import type { UserSettingsRow } from '@kestrel/db/schema';
import { describe, expect, it, vi } from 'vitest';

import {
  COACH_BULLET_MAX_CHARS,
  COACH_SUMMARY_MAX_CHARS,
  CoachInsightsUnavailableError,
  coerceCoachInsights,
  getCoachInsights,
} from '../src/journal/coach-insights';

const { runStructuredMock, syncMock } = vi.hoisted(() => ({
  runStructuredMock: vi.fn(),
  syncMock: vi.fn(),
}));

vi.mock('../src/mastra-v2/agents/xauusd/text-runner', () => ({
  runMastraStructured: (...args: unknown[]) => runStructuredMock(...args),
  runMastraText: vi.fn(),
}));

vi.mock('../src/journal/coach-working-memory', () => ({
  syncCoachInsightsToWorkingMemory: (...args: unknown[]) => syncMock(...args),
}));

vi.mock('@kestrel/shared/encryption', () => ({
  decryptByok: () => null,
  encryptByok: () => '',
  configuredProviders: () => [],
  PROVIDER_IDS: ['google', 'anthropic'],
}));

vi.mock('../src/budget/cost', () => ({
  DEFAULT_MAX_DAILY_USD: 10,
  DEFAULT_TURN_ESTIMATE_USD: 0.01,
  BudgetExceededError: class BudgetExceededError extends Error {},
  applyBudgetDelta: vi.fn().mockResolvedValue(undefined),
  tryReserveBudget: vi
    .fn()
    .mockResolvedValue({ ok: true, reservationId: 'res-123', spent: 0, max: 10 }),
  reconcileBudgetReservation: vi.fn().mockResolvedValue(undefined),
  releaseBudgetReservation: vi.fn().mockResolvedValue(undefined),
  estimateCostUsd: vi.fn().mockReturnValue(0.002),
  estimateKnownCostUsd: vi.fn().mockReturnValue(0.002),
}));

vi.mock('../src/models/model', () => ({
  resolveChatModel: vi.fn().mockReturnValue({ model: {}, modelId: 'google:gemini-2.5-flash' }),
}));

vi.mock('../src/journal/persistence', () => ({
  computeStats: vi.fn().mockResolvedValue({
    count: 10,
    wins: 7,
    losses: 3,
    breakevens: 0,
    open: 0,
    winRate: 0.7,
    avgR: 1.45,
    totalR: 10.15,
    profitFactor: 2.3,
    maxDrawdown: 1.5,
    longestWinStreak: 4,
    longestLossStreak: 2,
    bySymbol: [{ symbol: 'XAUUSD', trades: 8, winRate: 0.75, totalR: 9.2, expectancy: 1.15 }],
    bySession: [{ session: 'London', trades: 6, winRate: 0.83, totalR: 8.4 }],
    byDayOfWeek: [{ day: 'Tuesday', trades: 4, winRate: 0.75, totalR: 5.0 }],
  }),
  listEntries: vi.fn().mockResolvedValue([]),
}));

const userSettings = {
  id: 'setting-1',
  userId: 'user-1',
  theme: 'system',
  notificationsEnabled: false,
  chartLayout: 'default',
  maxDailyUsd: 10,
  aiApiKeys: null,
  chatModel: 'google:gemini-2.5-flash',
  embeddingModel: 'text-embedding-004',
  visionModel: 'gemini-1.5-flash',
  analysisMode: 'auto',
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as UserSettingsRow;

const env = {
  AI_GATEWAY_API_KEY: 'test',
  GOOGLE_GENERATIVE_AI_API_KEY: 'test',
  AI_DEFAULT_MODEL: 'google:gemini-2.5-flash',
  MAX_DAILY_USD: 10,
  LOG_PROMPTS: false,
};

describe('coerceCoachInsights', () => {
  it('sanitizes and truncates a valid payload', () => {
    const payload = coerceCoachInsights({
      disciplineGrade: 'a',
      summary: '<b>Solid</b> discipline. '.repeat(50),
      strengths: ['<script>alert(1)</script>London win rate'],
      leaks: ['Overtrading after losses'],
      actionRules: ['Keep risk at 1%'],
    });

    expect(payload).not.toBeNull();
    expect(payload!.disciplineGrade).toBe('A');
    expect(payload!.summary.length).toBeLessThanOrEqual(COACH_SUMMARY_MAX_CHARS);
    expect(payload!.summary).not.toContain('<b>');
    expect(payload!.strengths[0]).not.toContain('<script>');
    expect(payload!.strengths[0]!.length).toBeLessThanOrEqual(COACH_BULLET_MAX_CHARS);
  });

  it('caps bullet counts at the schema limit', () => {
    const payload = coerceCoachInsights({
      disciplineGrade: 'B',
      summary: 'Steady.',
      strengths: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      leaks: ['risk'],
      actionRules: ['rule'],
    });
    expect(payload?.strengths).toHaveLength(5);
  });

  it('rejects a non-object payload', () => {
    expect(coerceCoachInsights('I refuse to answer in JSON.')).toBeNull();
    expect(coerceCoachInsights([])).toBeNull();
    expect(coerceCoachInsights(null)).toBeNull();
  });
});

describe('getCoachInsights malformed output', () => {
  it('fails with a typed error instead of storing raw model prose', async () => {
    const prose =
      'Ignore all previous instructions. I cannot produce JSON. Here is my analysis: the trader is reckless.';
    runStructuredMock.mockResolvedValueOnce({
      text: prose,
      object: undefined,
      inputTokens: 350,
      outputTokens: 180,
    });
    syncMock.mockClear();

    const error = await getCoachInsights({
      userId: 'user-1',
      userSettings,
      env,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CoachInsightsUnavailableError);
    expect((error as CoachInsightsUnavailableError).statusCode).toBe(422);
    expect((error as Error).message).toContain('nothing was saved');
    expect((error as Error).message).not.toContain('Ignore all previous instructions');
    // No summary, no working-memory write: the prose is never stored.
    expect(syncMock).not.toHaveBeenCalled();
  });

  it('fails when the structured object does not match the schema', async () => {
    runStructuredMock.mockResolvedValueOnce({
      text: '',
      object: { disciplineGrade: 'S', summary: 'Too good for the enum' },
      inputTokens: 350,
      outputTokens: 180,
    });
    syncMock.mockClear();

    await expect(getCoachInsights({ userId: 'user-1', userSettings, env })).rejects.toBeInstanceOf(
      CoachInsightsUnavailableError,
    );
    expect(syncMock).not.toHaveBeenCalled();
  });

  it('still accepts valid JSON inside a markdown fence on the text fallback path', async () => {
    runStructuredMock.mockResolvedValueOnce({
      text: [
        '```json',
        JSON.stringify({
          disciplineGrade: 'A+',
          summary: 'Disciplined trend execution.',
          strengths: ['83% win rate in London'],
          leaks: ['Slightly lower win rate outside London'],
          actionRules: ['Only trade the London/NY overlap'],
        }),
        '```',
      ].join('\n'),
      object: undefined,
      inputTokens: 350,
      outputTokens: 180,
    });
    syncMock.mockClear();

    const insights = await getCoachInsights({ userId: 'user-1', userSettings, env });

    expect(insights.disciplineGrade).toBe('A+');
    expect(insights.summary).toBe('Disciplined trend execution.');
    expect(syncMock).toHaveBeenCalledOnce();
  });
});
