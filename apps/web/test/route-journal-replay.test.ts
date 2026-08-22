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

// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as replayGet } from '@/app/api/journal/[id]/replay/route';
import { POST as coachPost } from '@/app/api/journal/coach-insights/route';
import { auth } from '@/auth';

vi.mock('@/auth', () => ({ auth: vi.fn() }));

const mocks = vi.hoisted(() => ({
  getTradeSetupReplayService: vi.fn(),
  getCoachInsightsService: vi.fn(),
  getUserWithSettings: vi.fn(),
}));

vi.mock('@/lib/services/journal', () => ({
  getTradeSetupReplayService: mocks.getTradeSetupReplayService,
  getCoachInsightsService: mocks.getCoachInsightsService,
}));

vi.mock('@/lib/services/api-boundary', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/api-boundary')>();
  return {
    ...actual,
    getUserWithSettings: mocks.getUserWithSettings,
  };
});

vi.mock('@kestrel/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kestrel/db')>();
  return {
    ...actual,
    getUserWithSettings: mocks.getUserWithSettings,
  };
});

const USER_ID = 'test-user-001';

describe('/api/journal/[id]/replay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: USER_ID, role: 'trader' },
    });
    mocks.getUserWithSettings.mockResolvedValue({
      settings: {
        userId: USER_ID,
        maxDailyUsd: 10,
      },
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('returns trade setup replay data for authenticated user', async () => {
    mocks.getTradeSetupReplayService.mockResolvedValueOnce({
      symbol: 'XAUUSD',
      timeframe: '15m',
      candles: [{ t: 1000, o: 2500, h: 2510, l: 2495, c: 2505 }],
      mfe: { price: 2510, pips: 10, r: 2.0 },
      mae: { price: 2495, pips: 5, r: 1.0 },
      stats: { plannedRR: 2.0, realizedRR: 2.0, executionEfficiencyPct: 100 },
      keyLevels: { entry: 2500, stop: 2495, target: 2510, exit: 2510 },
    });

    const req = new Request('http://localhost:3000/api/journal/entry-123/replay?timeframe=15m');
    const res = await replayGet(req, { params: Promise.resolve({ id: 'entry-123' }) });

    expect(res.status).toBe(200);
    const json = (await res.json()) as { replay: { symbol: string } };
    expect(json.replay.symbol).toBe('XAUUSD');
    expect(mocks.getTradeSetupReplayService).toHaveBeenCalledWith({
      userId: USER_ID,
      id: 'entry-123',
      timeframe: '15m',
    });
  });

  it('returns 404 when replay is not found', async () => {
    mocks.getTradeSetupReplayService.mockResolvedValueOnce(null);

    const req = new Request('http://localhost:3000/api/journal/entry-999/replay');
    const res = await replayGet(req, { params: Promise.resolve({ id: 'entry-999' }) });

    expect(res.status).toBe(404);
  });
});

describe('/api/journal/coach-insights', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: USER_ID, role: 'trader' },
    });
    mocks.getUserWithSettings.mockResolvedValue({
      settings: {
        userId: USER_ID,
        maxDailyUsd: 10,
      },
    });
  });

  it('generates coach insights successfully', async () => {
    mocks.getCoachInsightsService.mockResolvedValueOnce({
      disciplineGrade: 'A',
      summary: 'Solid risk discipline.',
      strengths: ['High win rate on Gold'],
      leaks: ['None detected'],
      actionRules: ['Keep risk at 1%'],
      modelId: 'google:gemini-2.5-flash',
      costUsd: 0.001,
      latencyMs: 120,
    });

    const req = new Request('http://localhost:3000/api/journal/coach-insights', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });

    const res = await coachPost(req, { params: Promise.resolve({}) as never });
    expect(res.status).toBe(200);

    const json = (await res.json()) as { insights: { disciplineGrade: string } };
    expect(json.insights.disciplineGrade).toBe('A');
  });
});
