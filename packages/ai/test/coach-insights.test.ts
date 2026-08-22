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
import { describe, expect, it, vi } from 'vitest';

import { getCoachInsights } from '../src/journal/coach-insights';

vi.mock('@kestrel/shared/encryption', () => ({
  decryptByok: () => null,
  encryptByok: () => '',
  configuredProviders: () => [],
  PROVIDER_IDS: ['google', 'vertex', 'anthropic'],
}));

vi.mock('../src/cost', () => ({
  DEFAULT_MAX_DAILY_USD: 10,
  tryReserveBudget: vi
    .fn()
    .mockResolvedValue({ ok: true, reservationId: 'res-123', spent: 0, max: 10 }),
  reconcileBudgetReservation: vi.fn().mockResolvedValue(undefined),
  releaseBudgetReservation: vi.fn().mockResolvedValue(undefined),
  estimateCostUsd: vi.fn().mockReturnValue(0.002),
}));

vi.mock('../src/model', () => ({
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
  listEntries: vi.fn().mockResolvedValue([
    {
      id: 'entry-1',
      symbol: 'XAUUSD',
      side: 'long',
      openedAt: Date.now() - 3600000,
      entry: 2500,
      exit: 2520,
      outcome: 'win',
      rMultiple: 2.0,
      tags: ['smc', 'london'],
      notes: 'Clean FVG tap at London open',
    },
  ]),
}));

vi.mock('../src/mastra/text-runner', () => ({
  runMastraText: vi.fn().mockResolvedValue({
    text: JSON.stringify({
      disciplineGrade: 'A',
      summary: 'Strong trend-following execution with strict 1:2 R:R adherence.',
      strengths: ['83% win rate in London session on Gold', 'High expectancy of 1.15 on XAUUSD'],
      leaks: ['Slightly lower win rate outside London session'],
      actionRules: [
        'Only trade XAUUSD during London/NY overlap',
        'Maintain 1% risk per trade',
        'Log all trade notes immediately upon closure',
      ],
    }),
    inputTokens: 350,
    outputTokens: 180,
  }),
}));

describe('getCoachInsights', () => {
  const userSettings: UserSettingsRow = {
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
    GOOGLE_VERTEX_PROJECT: 'test',
    GOOGLE_VERTEX_LOCATION: 'us-central1',
    GOOGLE_APPLICATION_CREDENTIALS_JSON: undefined,
    GOOGLE_APPLICATION_CREDENTIALS: undefined,
    AI_DEFAULT_MODEL: 'google:gemini-2.5-flash',
    MAX_DAILY_USD: 10,
    LOG_PROMPTS: false,
  };

  it('generates structured coach insights with discipline grade and action rules', async () => {
    const result = await getCoachInsights({
      userId: 'user-1',
      userSettings,
      env,
    });

    expect(result.disciplineGrade).toBe('A');
    expect(result.summary).toContain('Strong trend-following execution');
    expect(result.strengths.length).toBeGreaterThan(0);
    expect(result.leaks.length).toBeGreaterThan(0);
    expect(result.actionRules.length).toBe(3);
    expect(result.modelId).toBe('google:gemini-2.5-flash');
    expect(result.costUsd).toBe(0.002);
  });
});
