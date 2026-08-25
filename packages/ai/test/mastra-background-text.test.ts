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

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runMastraBackgroundText } from '../src/mastra/background-text';

const mocks = vi.hoisted(() => ({
  reserveTurnBudget: vi.fn(),
  resolveMastraModel: vi.fn(),
  generate: vi.fn(),
  beginMastraRun: vi.fn(),
  finishMastraRun: vi.fn(),
  getMastraGenerationStats: vi.fn(),
  estimateCostUsd: vi.fn(),
}));

vi.mock('../src/budget-reservation', () => ({
  reserveTurnBudget: mocks.reserveTurnBudget,
}));
vi.mock('../src/model', () => ({
  resolveMastraModel: mocks.resolveMastraModel,
}));
vi.mock('../src/cost', () => ({
  DEFAULT_MAX_DAILY_USD: 5,
  DEFAULT_TURN_ESTIMATE_USD: 0.01,
  estimateCostUsd: mocks.estimateCostUsd,
}));
vi.mock('../src/mastra/telemetry', () => ({
  beginMastraRun: mocks.beginMastraRun,
  finishMastraRun: mocks.finishMastraRun,
  getMastraGenerationStats: mocks.getMastraGenerationStats,
  mastraOutcomeForError: vi.fn(() => 'failed'),
}));
vi.mock('../src/telemetry', () => ({
  telemetryConfig: vi.fn(() => ({})),
}));
vi.mock('@mastra/core/agent', () => ({
  Agent: vi.fn(function Agent() {
    return { generate: mocks.generate };
  }),
}));
vi.mock('@mastra/core/request-context', () => ({
  RequestContext: class RequestContext {
    readonly entries: Array<[string, unknown]>;
    constructor(entries: Array<[string, unknown]>) {
      this.entries = entries;
    }
  },
}));

const budget = {
  reconcile: vi.fn(),
  release: vi.fn(),
};

const settings = {
  aiApiKeys: null,
  chatModel: null,
  maxDailyUsd: 5,
};
const env = {};

describe('runMastraBackgroundText', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    budget.reconcile.mockResolvedValue(undefined);
    budget.release.mockResolvedValue(undefined);
    mocks.reserveTurnBudget.mockResolvedValue(budget);
    mocks.resolveMastraModel.mockReturnValue({
      model: {},
      modelId: 'google/gemini-3.6-flash',
      providerId: 'google',
      bareModelId: 'gemini-3.6-flash',
    });
    mocks.generate.mockResolvedValue({ text: 'bounded result' });
    mocks.getMastraGenerationStats.mockReturnValue({
      inputTokens: 100,
      outputTokens: 25,
      toolCalls: 0,
      steps: 1,
    });
    mocks.estimateCostUsd.mockReturnValue(0.004);
    mocks.finishMastraRun.mockResolvedValue(undefined);
  });

  it('reserves before model execution and reconciles the actual cost', async () => {
    const result = await runMastraBackgroundText({
      userId: 'user-1',
      threadId: 'thread-1',
      task: 'briefing',
      prompt: 'Write a briefing',
      system: 'Use only supplied facts.',
      settings,
      env,
    });

    expect(mocks.reserveTurnBudget).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        maxDailyUsd: 5,
        estimateUsd: 0.01,
        correlation: expect.objectContaining({ threadId: 'thread-1', runId: expect.any(String) }),
      }),
    );
    expect(mocks.generate).toHaveBeenCalledOnce();
    expect(budget.reconcile).toHaveBeenCalledWith(0.004);
    expect(budget.release).not.toHaveBeenCalled();
    expect(result.costUsd).toBe(0.004);
  });

  it('releases the reservation when the provider fails', async () => {
    const error = new Error('provider unavailable');
    mocks.generate.mockRejectedValue(error);

    await expect(
      runMastraBackgroundText({
        userId: 'user-1',
        threadId: 'thread-1',
        task: 'bot',
        prompt: 'Answer',
        system: 'Be concise.',
        settings,
        env,
      }),
    ).rejects.toBe(error);

    expect(budget.release).toHaveBeenCalledOnce();
    expect(budget.reconcile).not.toHaveBeenCalled();
  });
});
