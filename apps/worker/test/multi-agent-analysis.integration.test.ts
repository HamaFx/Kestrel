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

import type * as sharedModule from '@kestrel/shared';
import type * as sharedLoggerModule from '@kestrel/shared/logger';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runMultiAgentAnalysis } from '../src/jobs/multi-agent-analysis';

const {
  mockClaimNextFullAnalysisRun,
  mockCompleteFullAnalysisRun,
  mockFailFullAnalysisRun,
  mockRequeueFullAnalysisRun,
  mockTouchFullAnalysisRun,
  mockUpdateFullAnalysisProgress,
  MockFullAnalysisLeaseLostError,
  MockFullAnalysisCancelledError,
  MockFullAnalysisQuotaExceededError,
  MockFullAnalysisBudgetAdmissionError,
  mockFullAnalysisRetryAction,
  mockValidateFullAnalysisPlanIdentity,
  mockRecoverStaleRuns,
  mockPurgeOldRuns,
  mockRunMastraMode,
  mockReserveTurnBudget,
  mockResolveMastraModel,
  mockAppendUserMessage,
  mockAppendAssistantMessage,
  mockCreateExecutionLifecycle,
  mockCreateGenerationLedger,
} = vi.hoisted(() => ({
  mockClaimNextFullAnalysisRun: vi.fn(),
  mockCompleteFullAnalysisRun: vi.fn(),
  mockFailFullAnalysisRun: vi.fn(),
  mockRequeueFullAnalysisRun: vi.fn(),
  mockTouchFullAnalysisRun: vi.fn(),
  mockUpdateFullAnalysisProgress: vi.fn(),
  MockFullAnalysisLeaseLostError: class MockFullAnalysisLeaseLostError extends Error {
    code = 'FULL_ANALYSIS_LEASE_LOST';
  },
  MockFullAnalysisCancelledError: class MockFullAnalysisCancelledError extends Error {
    code = 'FULL_ANALYSIS_CANCELLED';
    constructor() {
      super('Full analysis job was cancelled.');
      this.name = 'FullAnalysisCancelledError';
    }
  },
  MockFullAnalysisQuotaExceededError: class MockFullAnalysisQuotaExceededError extends Error {
    code = 'FULL_ANALYSIS_BUDGET_EXCEEDED';
    spent: number;
    max: number;
    constructor(spent: number, max: number) {
      super(`Daily AI budget exceeded ($${spent.toFixed(2)} / $${max.toFixed(2)}).`);
      this.name = 'FullAnalysisQuotaExceededError';
      this.spent = spent;
      this.max = max;
    }
  },
  MockFullAnalysisBudgetAdmissionError: class MockFullAnalysisBudgetAdmissionError extends Error {
    code = 'FULL_ANALYSIS_BUDGET_ADMISSION_FAILED';
    constructor(cause: unknown) {
      super('Full-analysis budget admission failed.', { cause });
      this.name = 'FullAnalysisBudgetAdmissionError';
    }
  },
  mockFullAnalysisRetryAction: vi.fn(),
  mockValidateFullAnalysisPlanIdentity: vi.fn(),
  mockRecoverStaleRuns: vi.fn(),
  mockPurgeOldRuns: vi.fn(),
  mockRunMastraMode: vi.fn(),
  mockReserveTurnBudget: vi.fn(),
  mockResolveMastraModel: vi.fn(),
  mockAppendUserMessage: vi.fn(),
  mockAppendAssistantMessage: vi.fn(),
  mockCreateGenerationLedger: vi.fn(() => ({
    record: vi.fn(() => true),
    recordCost: vi.fn(() => true),
    recordUsage: vi.fn(() => true),
    snapshot: () => ({ entries: [], totalCostUsd: 0 }),
    total: (): number => 0.04,
  })),
  mockCreateExecutionLifecycle: vi.fn(
    (budget: { reconcile: (costUsd: number) => Promise<void>; release: () => Promise<void> }) => {
      let settled = false;
      let terminal: Promise<void> | null = null;
      const once = (operation: () => Promise<void>) => {
        if (terminal) return terminal;
        settled = true;
        terminal = operation();
        return terminal;
      };
      return {
        complete: (costUsd: number) => once(() => budget.reconcile(costUsd)),
        fail: () => once(() => budget.release()),
        cancel: () => once(() => budget.release()),
        get settled() {
          return settled;
        },
        get state() {
          return settled ? 'completed' : null;
        },
      };
    },
  ),
}));

const settingsRow = {
  userId: 'user-1',
  defaultSymbol: 'XAUUSD',
  timezone: 'UTC',
  language: 'en',
  customInstructions: null,
  aiApiKeys: null,
  chatModel: null,
  maxDailyUsd: 5,
};

const payload = {
  kind: 'full-analysis' as const,
  version: 1,
  userId: 'user-1',
  threadId: 'thread-1',
  userMessageText: 'Analyze XAUUSD technically',
  userMessageParts: [{ type: 'text', text: 'Analyze XAUUSD technically' }],
  idempotencyKey: 'full:thread-1:message-1',
  traceId: 'trace-worker-1',
  attemptCount: 1,
  createdAt: '2026-08-15T12:00:00.000Z',
  modelSnapshot: {
    modelId: 'google/gemini-2.5-flash',
    providerId: 'google',
    bareModelId: 'gemini-2.5-flash',
  },
};

const claimed = { runId: 'run-1', tenantId: 'tenant-1', payload };

const mockDb = {
  select: () => ({
    from: () => ({
      where: () => Promise.resolve([settingsRow]),
    }),
  }),
};

vi.mock('@kestrel/db', () => ({
  schema: { userSettings: { userId: 'userSettings.userId' } },
}));

vi.mock('@kestrel/ai/mastra', () => ({
  claimNextFullAnalysisRun: mockClaimNextFullAnalysisRun,
  completeFullAnalysisRun: mockCompleteFullAnalysisRun,
  failFullAnalysisRun: mockFailFullAnalysisRun,
  requeueFullAnalysisRun: mockRequeueFullAnalysisRun,
  touchFullAnalysisRun: mockTouchFullAnalysisRun,
  updateFullAnalysisProgress: mockUpdateFullAnalysisProgress,
  FullAnalysisLeaseLostError: MockFullAnalysisLeaseLostError,
  FullAnalysisCancelledError: MockFullAnalysisCancelledError,
  FullAnalysisQuotaExceededError: MockFullAnalysisQuotaExceededError,
  FullAnalysisBudgetAdmissionError: MockFullAnalysisBudgetAdmissionError,
  fullAnalysisRetryAction: mockFullAnalysisRetryAction,
  validateFullAnalysisPlanIdentity: mockValidateFullAnalysisPlanIdentity,
  recoverStaleFullAnalysisRuns: mockRecoverStaleRuns,
  purgeOldFullAnalysisRuns: mockPurgeOldRuns,
  FULL_ANALYSIS_WORKFLOW_ID: 'full-analysis',
  FULL_ANALYSIS_ESTIMATE_USD: 0.058,
  extractSymbolFromPrompt: vi.fn(() => 'XAUUSD'),
  isSafeSymbolResearchPrompt: vi.fn(() => true),
  runMastraMode: mockRunMastraMode,
  maybeGenerateThreadTitle: vi.fn(async () => {}),
}));

vi.mock('@kestrel/ai', () => ({
  getDb: () => mockDb,
  resolveMastraModel: mockResolveMastraModel,
  appendUserMessage: mockAppendUserMessage,
  appendAssistantMessage: mockAppendAssistantMessage,
  DEFAULT_MAX_DAILY_USD: 5,
  reserveTurnBudget: mockReserveTurnBudget,
  withDiagnostics: async (_userId: string, _threadId: string, fn: () => Promise<unknown>) => fn(),
  createExecutionLifecycle: mockCreateExecutionLifecycle,
  createGenerationLedger: mockCreateGenerationLedger,
}));

vi.mock('@kestrel/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof sharedModule>();
  return { ...actual, pickAiEnv: (env: unknown) => env };
});

vi.mock('@kestrel/shared/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof sharedLoggerModule>();
  return {
    ...actual,
    traceIdStorage: { run: async (_traceId: string, fn: () => Promise<unknown>) => fn() },
  };
});

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  eq: vi.fn(),
}));

describe('runMultiAgentAnalysis Mastra durable boundary', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/kestrel_test';
    mockClaimNextFullAnalysisRun.mockResolvedValueOnce(claimed).mockResolvedValueOnce(null);
    mockRecoverStaleRuns.mockResolvedValue({ requeued: 0, failed: 0 });
    mockPurgeOldRuns.mockResolvedValue(0);
    mockResolveMastraModel.mockReturnValue({
      modelId: 'google/gemini-2.5-flash',
      providerId: 'google',
      bareModelId: 'gemini-2.5-flash',
      model: {},
    });
    mockReserveTurnBudget.mockResolvedValue({
      reconcile: vi.fn().mockResolvedValue(undefined),
      release: vi.fn().mockResolvedValue(undefined),
    });
    mockAppendUserMessage.mockResolvedValue({ messageId: 'user-message-1' });
    mockAppendAssistantMessage.mockResolvedValue({ messageId: 'assistant-message-1' });
    mockRunMastraMode.mockResolvedValue({
      finalText: 'Full Mastra analysis result',
      agentOpinions: [{ agentName: 'technical', bias: 'bullish' }],
      mode: 'full',
      symbol: 'XAUUSD',
      packet: { packetId: 'packet-1', dataQuality: 'complete' },
      totalCostUsd: 0.04,
      totalLatencyMs: 321,
      answerOutcome: 'degraded',
      memoryMode: 'degraded',
      memoryBackfill: true,
      modelSnapshot: { providerId: 'google', bareModelId: 'gemini-2.5-flash' },
    });
    mockFullAnalysisRetryAction.mockImplementation(
      (error: unknown, opts: { attemptCount: number; maxAttempts: number }) => {
        if (error instanceof MockFullAnalysisLeaseLostError) {
          return { action: 'discard', category: 'lease' };
        }
        if (error instanceof MockFullAnalysisQuotaExceededError) {
          return { action: 'fail', category: 'quota' };
        }
        if (error instanceof MockFullAnalysisBudgetAdmissionError) {
          return opts.attemptCount < opts.maxAttempts
            ? { action: 'requeue', category: 'transient' }
            : { action: 'fail', category: 'transient' };
        }
        const message = error instanceof Error ? error.message : String(error);
        const retryable =
          /(?:timeout|timed?\s*out|aborted|network|fetch\s*failed|rate\s*limit|too\s*many\s*requests|temporar(?:y|ily)|connection|ECONNRESET|5\d\d)/i.test(
            message,
          );
        return opts.attemptCount < opts.maxAttempts && retryable
          ? { action: 'requeue', category: 'transient' }
          : { action: 'fail', category: 'permanent' };
      },
    );
    mockValidateFullAnalysisPlanIdentity.mockReturnValue(undefined);
  });

  afterEach(() => {
    if (originalDatabaseUrl !== undefined) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
  });

  function context() {
    return {
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), with: vi.fn() },
      signal: new AbortController().signal,
      tenantRouter: { isMyTenant: (tenantId: string) => tenantId === 'tenant-1' } as never,
    };
  }

  it('claims a durable run and executes only the Mastra Full workflow', async () => {
    const ctx = context();
    const result = await runMultiAgentAnalysis(ctx);

    expect(result).toEqual({ processed: 1, note: 'processed=1' });
    expect(mockClaimNextFullAnalysisRun).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Function),
    );
    const ownsTenant = mockClaimNextFullAnalysisRun.mock.calls[0]?.[1] as (
      tenantId: string,
    ) => boolean;
    expect(ownsTenant('tenant-1')).toBe(true);
    expect(ownsTenant('user-1')).toBe(false);
    expect(mockRunMastraMode).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thread-1',
        userId: 'user-1',
        runId: 'run-1',
        mode: 'full',
        symbol: 'XAUUSD',
        workflowId: 'full-analysis',
        telemetryKind: 'mastra_full_job',
        modelOverride: 'google:gemini-2.5-flash',
      }),
    );
    expect(mockAppendUserMessage).toHaveBeenCalledWith(
      'user-1',
      'thread-1',
      expect.objectContaining({ role: 'user' }),
      { idempotencyKey: 'analysis-job:run-1:user' },
    );
    const assistant = mockAppendAssistantMessage.mock.calls[0]?.[2] as {
      parts?: Array<{ type: string; data?: Record<string, unknown> }>;
    };
    expect(assistant.parts?.[1]).toMatchObject({
      type: 'data-multi-agent-meta',
      data: { memoryMode: 'degraded', memoryBackfill: true },
    });
    expect(mockCompleteFullAnalysisRun).toHaveBeenCalledWith(
      'run-1',
      expect.any(String),
      expect.objectContaining({ finalText: 'Full Mastra analysis result' }),
    );
    expect(mockTouchFullAnalysisRun).toHaveBeenCalledWith('run-1', expect.any(String));
  });

  it('discards a result when the lease is lost before message projection', async () => {
    const ctx = context();
    mockTouchFullAnalysisRun.mockRejectedValueOnce(new MockFullAnalysisLeaseLostError());

    const result = await runMultiAgentAnalysis(ctx);

    expect(result).toEqual({ processed: 0, note: 'processed=0' });
    expect(mockAppendAssistantMessage).not.toHaveBeenCalled();
    expect(mockCompleteFullAnalysisRun).not.toHaveBeenCalled();
    expect(mockRequeueFullAnalysisRun).not.toHaveBeenCalled();
    expect(mockFailFullAnalysisRun).not.toHaveBeenCalled();
  });

  it('fails a run permanently when budget admission rejects the user quota', async () => {
    const ctx = context();
    const quotaError = Object.assign(new Error('daily budget exceeded'), {
      code: 'BUDGET_EXCEEDED',
      spent: 5,
      max: 5,
    });
    mockReserveTurnBudget.mockRejectedValueOnce(quotaError);

    const result = await runMultiAgentAnalysis(ctx);

    expect(result).toEqual({ processed: 1, note: 'processed=1' });
    expect(mockFailFullAnalysisRun).toHaveBeenCalledWith(
      'run-1',
      expect.any(String),
      expect.objectContaining({
        name: 'FullAnalysisQuotaExceededError',
        code: 'FULL_ANALYSIS_BUDGET_EXCEEDED',
      }),
    );
    expect(mockRequeueFullAnalysisRun).not.toHaveBeenCalled();
    expect(mockRunMastraMode).not.toHaveBeenCalled();
  });

  it('requeues a transient budget admission failure before model execution', async () => {
    const ctx = context();
    mockReserveTurnBudget.mockRejectedValueOnce(new Error('budget database timeout'));

    const result = await runMultiAgentAnalysis(ctx);

    expect(result).toEqual({ processed: 1, note: 'processed=1' });
    expect(mockRequeueFullAnalysisRun).toHaveBeenCalledWith(
      'run-1',
      expect.any(String),
      expect.stringContaining('retrying automatically'),
      expect.objectContaining({ entries: [], totalCostUsd: 0 }),
    );
    expect(mockFailFullAnalysisRun).not.toHaveBeenCalled();
    expect(mockRunMastraMode).not.toHaveBeenCalled();
  });

  it('requeues a retryable Mastra provider timeout', async () => {
    const ctx = context();
    mockRunMastraMode.mockRejectedValueOnce(new Error('upstream timeout'));

    const result = await runMultiAgentAnalysis(ctx);

    expect(result).toEqual({ processed: 1, note: 'processed=1' });
    expect(mockRequeueFullAnalysisRun).toHaveBeenCalledWith(
      'run-1',
      expect.any(String),
      expect.stringContaining('retrying automatically'),
      expect.objectContaining({ entries: [], totalCostUsd: 0 }),
    );
    expect(mockCompleteFullAnalysisRun).not.toHaveBeenCalled();
    expect(mockFailFullAnalysisRun).not.toHaveBeenCalled();
  });

  it('releases the reservation when assistant persistence fails', async () => {
    const ctx = context();
    const budget = {
      reconcile: vi.fn().mockResolvedValue(undefined),
      release: vi.fn().mockResolvedValue(undefined),
    };
    mockReserveTurnBudget.mockResolvedValueOnce(budget);
    mockAppendAssistantMessage.mockRejectedValueOnce(
      new Error('assistant persistence unavailable'),
    );

    const result = await runMultiAgentAnalysis(ctx);

    expect(result).toEqual({ processed: 1, note: 'processed=1' });
    expect(budget.reconcile).toHaveBeenCalledWith(0.04);
    expect(budget.release).not.toHaveBeenCalled();
    expect(mockFailFullAnalysisRun).toHaveBeenCalledWith(
      'run-1',
      expect.any(String),
      expect.any(Error),
    );
    expect(mockCompleteFullAnalysisRun).not.toHaveBeenCalled();
  });

  it('commits a terminal failure without a partial result for non-retryable errors', async () => {
    const ctx = context();
    mockRunMastraMode.mockRejectedValueOnce(new Error('invalid structured output'));

    const result = await runMultiAgentAnalysis(ctx);

    expect(result).toEqual({ processed: 1, note: 'processed=1' });
    expect(mockFailFullAnalysisRun).toHaveBeenCalledWith(
      'run-1',
      expect.any(String),
      expect.any(Error),
    );
    expect(mockCompleteFullAnalysisRun).not.toHaveBeenCalled();
    expect(mockRequeueFullAnalysisRun).not.toHaveBeenCalled();
  });

  it('does not settle twice when queue completion transition fails', async () => {
    const ctx = context();
    const budget = {
      reconcile: vi.fn().mockResolvedValue(undefined),
      release: vi.fn().mockResolvedValue(undefined),
    };
    mockReserveTurnBudget.mockResolvedValueOnce(budget);
    mockCompleteFullAnalysisRun.mockRejectedValueOnce(new Error('queue completion unavailable'));

    const result = await runMultiAgentAnalysis(ctx);

    expect(result).toEqual({ processed: 1, note: 'processed=1' });
    expect(budget.reconcile).toHaveBeenCalledWith(0.04);
    expect(budget.reconcile).toHaveBeenCalledOnce();
    expect(budget.release).not.toHaveBeenCalled();
    expect(mockFailFullAnalysisRun).toHaveBeenCalledOnce();
  });

  it('does not settle twice when queue failure transition fails', async () => {
    const ctx = context();
    mockRunMastraMode.mockRejectedValueOnce(new Error('invalid structured output'));
    mockFailFullAnalysisRun.mockRejectedValueOnce(new Error('queue failure unavailable'));

    await expect(runMultiAgentAnalysis(ctx)).rejects.toThrow('queue failure unavailable');

    expect(mockRunMastraMode).toHaveBeenCalledOnce();
    expect(mockFailFullAnalysisRun).toHaveBeenCalledOnce();
  });

  it('runs stale recovery and retention purge after the queue poll', async () => {
    const ctx = context();
    await runMultiAgentAnalysis(ctx);

    expect(mockRecoverStaleRuns).toHaveBeenCalledWith(expect.any(Date), 3);
    expect(mockPurgeOldRuns).toHaveBeenCalledWith(expect.any(Date));
  });

  it('awaits maybeGenerateThreadTitle before recording observedCost and completing the run', async () => {
    const ctx = context();
    let totalCost = 0.04;
    mockCreateGenerationLedger.mockReturnValueOnce({
      record: vi.fn(() => true),
      recordCost: vi.fn(() => true),
      recordUsage: vi.fn(() => true),
      snapshot: () => ({ entries: [], totalCostUsd: totalCost }),
      total: () => totalCost,
    });
    const mastraMod = await import('@kestrel/ai/mastra');
    vi.mocked(mastraMod.maybeGenerateThreadTitle).mockImplementationOnce(async () => {
      await new Promise((r) => setTimeout(r, 15));
      totalCost = 0.042;
    });

    await runMultiAgentAnalysis(ctx);

    expect(mockCompleteFullAnalysisRun).toHaveBeenCalledWith(
      'run-1',
      expect.any(String),
      expect.objectContaining({
        totalCostUsd: 0.042,
      }),
    );
  });

  it('exits the claim loop immediately when ctx.signal is already aborted', async () => {
    const ctx = context();
    const ac = new AbortController();
    ac.abort();
    ctx.signal = ac.signal;

    const result = await runMultiAgentAnalysis(ctx);

    expect(result.processed).toBe(0);
    expect(mockClaimNextFullAnalysisRun).not.toHaveBeenCalled();
  });

  it('appends stream interrupted message and does not fail or requeue when job is cancelled', async () => {
    const ctx = context();
    mockTouchFullAnalysisRun.mockRejectedValueOnce(new MockFullAnalysisCancelledError());

    const result = await runMultiAgentAnalysis(ctx);

    expect(result.processed).toBe(1);
    expect(mockAppendAssistantMessage).toHaveBeenCalledWith(
      'user-1',
      'thread-1',
      expect.objectContaining({
        role: 'assistant',
        parts: [{ type: 'text', text: '_Stream interrupted — please retry._' }],
      }),
      { idempotencyKey: 'analysis-job:run-1:interrupted' },
    );
    expect(mockCompleteFullAnalysisRun).not.toHaveBeenCalled();
    expect(mockFailFullAnalysisRun).not.toHaveBeenCalled();
    expect(mockRequeueFullAnalysisRun).not.toHaveBeenCalled();
  });

  it('treats a progress write racing cancellation as cancellation, not lease loss', async () => {
    const ctx = context();
    // The user cancels while a workflow step writes progress: the queue row is
    // no longer `running`, so the progress write rejects with the cancelled
    // classification before the heartbeat ever observes the flag.
    mockUpdateFullAnalysisProgress.mockRejectedValueOnce(new MockFullAnalysisCancelledError());
    mockRunMastraMode.mockImplementationOnce(
      async (options: { onProgress?: (step: string) => Promise<void> }) => {
        await options.onProgress?.('technical');
        throw new Error('unreachable — progress must throw first');
      },
    );

    const result = await runMultiAgentAnalysis(ctx);

    expect(result.processed).toBe(1);
    expect(mockAppendAssistantMessage).toHaveBeenCalledWith(
      'user-1',
      'thread-1',
      expect.objectContaining({
        role: 'assistant',
        parts: [{ type: 'text', text: '_Stream interrupted — please retry._' }],
      }),
      { idempotencyKey: 'analysis-job:run-1:interrupted' },
    );
    expect(mockCompleteFullAnalysisRun).not.toHaveBeenCalled();
    expect(mockFailFullAnalysisRun).not.toHaveBeenCalled();
    expect(mockRequeueFullAnalysisRun).not.toHaveBeenCalled();
  });
});
