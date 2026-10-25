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

import type { LanguageModel } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ReportGenerationModule from '../src/mastra-v2/agents/xauusd/report/report-generation';
import {
  resolveXauusdMastraModel,
  runXauusdMastra,
  runXauusdMastraConversation,
} from '../src/mastra-v2/agents/xauusd/run';
import type { ExecutionPlan } from '../src/mastra-v2/planning/execution-plan';

const mocks = vi.hoisted(() => {
  class FakeVerificationError extends Error {}
  return {
    resolveChatModel: vi.fn(),
    resolveMastraModel: vi.fn(),
    resolveMastraExecutionModel: vi.fn(),
    resolveEmbeddingModel: vi.fn(() => 'openai/text-embedding-3-small'),
    createXauusdMastraAgent: vi.fn(),
    collectXauusdResearchPacket: vi.fn(),
    requireVerifiedXauusdReport: vi.fn(),
    XauusdReportVerificationError: FakeVerificationError,
    beginMastraRun: vi.fn(),
    finishMastraRun: vi.fn().mockResolvedValue(undefined),
    getMastraGenerationStats: vi.fn(() => ({
      inputTokens: 4,
      outputTokens: 6,
      toolCalls: 1,
      steps: 2,
    })),
    mastraOutcomeForError: vi.fn(() => 'failed'),
    generateXauusdFollowup: vi.fn(),
    getDiagnosticContext: vi.fn(() => ({ traceId: 'trace-1' })),
    withDiagnostics: vi.fn(async (_userId: string, _threadId: string, fn: () => Promise<unknown>) =>
      fn(),
    ),
    buildGuardrailInputProcessors: vi.fn(
      (_options: {
        settings: { aiApiKeys: unknown; chatModel: unknown };
        env: unknown;
        strategy: 'block' | 'rewrite';
        mode: 'strict' | 'availability';
      }) => ({ processors: ['guardrail-processor'], warnings: [], mode: 'strict' }),
    ),
  };
});

vi.mock('../src/models/model', () => ({
  resolveChatModel: mocks.resolveChatModel,
  resolveMastraModel: mocks.resolveMastraModel,
  resolveMastraExecutionModel: mocks.resolveMastraExecutionModel,
  resolveEmbeddingModel: mocks.resolveEmbeddingModel,
}));
vi.mock('../src/mastra-v2/agents/xauusd/agent', () => ({
  createXauusdMastraAgent: mocks.createXauusdMastraAgent,
}));
vi.mock('../src/mastra-v2/packets/research-packet', () => ({
  collectXauusdResearchPacket: mocks.collectXauusdResearchPacket,
}));
vi.mock('../src/mastra-v2/agents/xauusd/report/report-verifier', () => ({
  requireVerifiedXauusdReport: mocks.requireVerifiedXauusdReport,
  XauusdReportVerificationError: mocks.XauusdReportVerificationError,
}));
vi.mock('../src/mastra-v2/shared/telemetry', () => ({
  beginMastraRun: mocks.beginMastraRun,
  finishMastraRun: mocks.finishMastraRun,
  getMastraGenerationStats: mocks.getMastraGenerationStats,
  mastraOutcomeForError: mocks.mastraOutcomeForError,
  MASTRA_XAUUSD_AGENT_ID: 'kestrel-xauusd-research-poc',
  MASTRA_XAUUSD_AGENT_VERSION: 'poc-1',
}));
vi.mock('../src/diagnostics', () => ({
  getDiagnosticContext: mocks.getDiagnosticContext,
  withDiagnostics: mocks.withDiagnostics,
}));
// Audit plan §1.9: the XAUUSD runners derive guardrails from the execution
// plan through `buildGuardrailInputProcessors`; spy on it to assert the plan
// policy instead of the legacy conversation/research convenience builders.
vi.mock('../src/mastra-v2/guardrails', () => ({
  buildGuardrailInputProcessors: mocks.buildGuardrailInputProcessors,
  buildConversationGuardrails: vi.fn(),
  buildResearchGuardrails: vi.fn(),
  buildResearchGuardrailsAvailability: vi.fn(),
  GuardrailUnavailableError: class GuardrailUnavailableError extends Error {},
}));

vi.mock('../src/mastra-v2/agents/xauusd/report/report-generation', async (importOriginal) => {
  const actual = await importOriginal<typeof ReportGenerationModule>();
  return { ...actual, generateXauusdFollowup: mocks.generateXauusdFollowup };
});

const model = {} as LanguageModel;
const settings = { aiApiKeys: null, chatModel: null };
const env = {} as Parameters<typeof resolveXauusdMastraModel>[1];

/**
 * Minimal immutable plan for the untrusted XAUUSD capabilities: the manifest
 * trust policy resolves to guardrail strict + block for both routes.
 */
function planFor(route: 'xauusd-conversation' | 'xauusd-research'): ExecutionPlan {
  return {
    version: 1,
    route,
    capabilityId: route,
    capabilityVersion: 'poc-5',
    symbol: 'XAUUSD',
    symbols: [],
    mode: 'single',
    model: { providerId: 'google', bareModelId: 'gemini-2.5-flash' },
    toolPolicy: { capabilityId: route, tools: [], readOnly: true, requiresConfirmation: false },
    evidencePolicy: { required: true, externalData: true, contentTrust: 'untrusted' },
    memoryPolicy: { mode: 'native', required: true, scope: 'user-thread', semanticRecall: true },
    guardrail: { mode: 'strict', strategy: 'block' },
    maxSteps: 3,
    maxDurationMs: 55_000,
    streaming: route === 'xauusd-conversation',
    mutationRequested: false,
    tenantId: 'user-1',
    xauusdChatKind: route === 'xauusd-conversation' ? 'conversation' : 'research',
    reportFollowup: false,
    symbolCandidate: true,
    xauusdCandidate: true,
  };
}

describe('Mastra BYOK runner', () => {
  beforeEach(() => {
    mocks.resolveChatModel.mockReset();
    mocks.resolveMastraExecutionModel
      .mockReset()
      .mockImplementation(
        (args: {
          settings: typeof settings;
          env: typeof env;
          domain: string;
          modelOverride?: string | null;
        }) =>
          mocks.resolveChatModel(
            {
              aiApiKeys: args.settings.aiApiKeys,
              chatModel: args.modelOverride ?? args.settings.chatModel ?? null,
            },
            args.env,
            args.domain,
          ),
      );
    mocks.createXauusdMastraAgent.mockReset();
    mocks.collectXauusdResearchPacket.mockReset().mockResolvedValue({
      packetId: 'packet-1',
      kind: 'research_packet',
      symbol: 'XAUUSD',
      generatedAt: new Date().toISOString(),
      status: 'ready',
      dataQuality: 'complete',
      timeframes: ['1d', '4h', '1h', '15m'],
      price: null,
      candles: [],
      indicators: [],
      macro: null,
      missingData: [],
      warnings: [],
    });
    mocks.requireVerifiedXauusdReport.mockReset().mockReturnValue({
      symbol: 'XAUUSD',
      asOf: new Date().toISOString(),
      dataQuality: 'complete',
      bias: 'neutral',
      confidence: 0.5,
      regime: 'range',
      bottomLine: 'Test report',
      technicalSummary: 'Test technical summary',
      fundamentalSummary: 'Unavailable in POC',
      scenarios: [
        {
          name: 'Bullish',
          direction: 'bullish',
          trigger: 'breakout',
          invalidation: 'below level',
          targets: [],
          risks: ['volatility'],
          evidenceIds: ['packet-1'],
        },
        {
          name: 'Bearish',
          direction: 'bearish',
          trigger: 'breakdown',
          invalidation: 'above level',
          targets: [],
          risks: ['volatility'],
          evidenceIds: ['packet-1'],
        },
      ],
      contradictions: [],
      missingData: [],
      numericClaims: [{ label: 'Test claim', value: 1, evidenceId: 'packet-1' }],
      evidenceIds: ['packet-1'],
      sources: [{ evidenceId: 'packet-1', source: 'fixture', dataAsOf: new Date().toISOString() }],
    });
    mocks.beginMastraRun.mockReset();
    mocks.finishMastraRun.mockReset().mockResolvedValue(undefined);
    mocks.getMastraGenerationStats
      .mockReset()
      .mockReturnValue({ inputTokens: 4, outputTokens: 6, toolCalls: 1, steps: 2 });
    mocks.mastraOutcomeForError.mockReset().mockReturnValue('failed');
    mocks.getDiagnosticContext.mockReturnValue({ traceId: 'trace-1' });
    mocks.buildGuardrailInputProcessors
      .mockReset()
      .mockReturnValue({ processors: ['guardrail-processor'], warnings: [], mode: 'strict' });
    mocks.resolveChatModel.mockReturnValue({
      model,
      modelId: 'google/gemini-2.5-flash',
      providerId: 'google',
      bareModelId: 'gemini-2.5-flash',
    });
  });

  it('keeps a resolved model snapshot stable across repeated resolution', () => {
    const first = resolveXauusdMastraModel(settings, env);
    const second = resolveXauusdMastraModel(settings, env);
    expect({ providerId: first.providerId, bareModelId: first.bareModelId }).toEqual({
      providerId: second.providerId,
      bareModelId: second.bareModelId,
    });
  });

  it('uses the same Kestrel resolver and technical tier (fast model, not the user chat model)', () => {
    const resolved = resolveXauusdMastraModel(settings, env);

    expect(resolved.model).toBe(model);
    // M6 — the Mastra report pipeline must NOT inherit the user's heavyweight
    // chat model (e.g. mistral-large); it resolves the provider's fast
    // technical tier instead, so the multi-step verified-report flow stays
    // inside the 55s route budget.
    expect(mocks.resolveChatModel).toHaveBeenCalledWith(
      { aiApiKeys: settings.aiApiKeys, chatModel: null },
      env,
      'technical',
    );
  });

  it('honors an explicit MASTRA_XAUUSD_MODEL override when set', () => {
    process.env.MASTRA_XAUUSD_MODEL = 'mistral:mistral-small-latest';
    try {
      resolveXauusdMastraModel(settings, env);
      expect(mocks.resolveChatModel).toHaveBeenCalledWith(
        { aiApiKeys: settings.aiApiKeys, chatModel: 'mistral:mistral-small-latest' },
        env,
        'technical',
      );
    } finally {
      delete process.env.MASTRA_XAUUSD_MODEL;
    }
  });

  it('forwards the caller modelOverride to the model resolver', async () => {
    const generate = vi.fn().mockResolvedValue({ text: 'grounded result', object: {} });
    mocks.createXauusdMastraAgent.mockReturnValue({ generate });

    await runXauusdMastra({
      prompt: 'Analyse gold',
      userId: 'user-1',
      threadId: 'thread-1',
      runId: 'run-override',
      settings,
      env,
      modelOverride: 'google:gemini-3.6-flash',
    });

    expect(mocks.resolveChatModel).toHaveBeenCalledWith(
      { aiApiKeys: settings.aiApiKeys, chatModel: 'google:gemini-3.6-flash' },
      env,
      'technical',
    );
  });

  it('injects the resolved model and authenticated request context into Mastra', async () => {
    const generate = vi.fn().mockResolvedValue({ text: 'grounded result', object: {} });
    mocks.createXauusdMastraAgent.mockReturnValue({ generate });

    const result = await runXauusdMastra({
      prompt: 'Analyse gold',
      userId: 'user-1',
      threadId: 'thread-1',
      runId: 'run-1',
      settings,
      env,
    });

    expect(result).toMatchObject({
      modelId: 'google/gemini-2.5-flash',
      providerId: 'google',
      stats: { inputTokens: 4, outputTokens: 6, toolCalls: 1, steps: 2 },
      memoryMode: 'degraded',
      memoryBackfill: true,
    });
    // The agent now also receives the per-request memory instance.
    expect(mocks.createXauusdMastraAgent).toHaveBeenCalledWith(expect.objectContaining({ model }));
    expect(generate).toHaveBeenCalledWith(
      'Analyse gold',
      expect.objectContaining({
        requestContext: expect.objectContaining({
          get: expect.any(Function),
        }),
        toolChoice: 'none',
        structuredOutput: expect.objectContaining({ schema: expect.anything() }),
      }),
    );
    const options = generate.mock.calls[0]![1] as {
      requestContext: { get: (key: string) => unknown };
    };
    expect(options.requestContext.get('userId')).toBe('user-1');
    expect(options.requestContext.get('threadId')).toBe('thread-1');
    expect(options.requestContext.get('runId')).toBe('run-1');
    expect(mocks.finishMastraRun).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        threadId: 'thread-1',
        runId: 'run-1',
        model: 'google/gemini-2.5-flash',
        outcome: 'success',
        memoryMode: 'degraded',
        memoryBackfill: true,
      }),
    );
  });

  it('runs conversational Single mode without structured report output', async () => {
    const generate = vi
      .fn()
      .mockResolvedValue({ text: 'The current packet suggests a cautious range.' });
    mocks.createXauusdMastraAgent.mockReturnValue({ generate });
    const priorReport = { symbol: 'XAUUSD', bias: 'neutral' } as never;
    const signal = new AbortController().signal;

    const result = await runXauusdMastraConversation({
      prompt: 'Explain the current gold context',
      userId: 'user-1',
      threadId: 'thread-1',
      runId: 'conversation-1',
      settings,
      env,
      signal,
      priorReport,
    });

    expect(result).toMatchObject({
      report: null,
      modelId: 'google/gemini-2.5-flash',
      providerId: 'google',
    });
    expect(generate).toHaveBeenCalledWith(
      'Explain the current gold context',
      expect.objectContaining({
        toolChoice: 'auto',
        activeTools: [
          'getXauusdMarketStructure',
          'getXauusdSessionLevels',
          'analyzeXauusdTechnical',
          'getXauusdCorrelation',
          'getXauusdIntermarket',
          'forecastXauusdVolatility',
          'getXauusdNews',
          'getXauusdCalendar',
          'getXauusdSocialSentiment',
          'getXauusdFundamentalContext',
          'getXauusdSeasonality',
          'getXauusdCot',
          'getXauusdIntermarketResonance',
          'searchUntrustedWeb',
          'searchUntrustedKnowledge',
        ],
        maxSteps: 3,
      }),
    );
    const options = generate.mock.calls[0]![1] as {
      requestContext: { get: (key: string) => unknown };
      structuredOutput?: unknown;
      abortSignal?: AbortSignal;
      activeTools?: string[];
    };
    expect(options.structuredOutput).toBeUndefined();
    expect(options.abortSignal).toBe(signal);
    expect(options.requestContext.get('priorReport')).toBe(priorReport);
  });

  it('derives XAUUSD conversation guardrails from the execution plan policy (§1.9)', async () => {
    const generate = vi.fn().mockResolvedValue({ text: 'guarded answer' });
    mocks.createXauusdMastraAgent.mockReturnValue({ generate });

    await runXauusdMastraConversation({
      prompt: 'Explain the current gold context',
      userId: 'user-1',
      threadId: 'thread-1',
      runId: 'conversation-plan-1',
      settings,
      env,
      executionPlan: planFor('xauusd-conversation'),
    });

    // The untrusted xauusd-conversation capability runs the manifest policy
    // carried by the plan (strict + block) — no longer the legacy
    // rewrite + availability conversation builder.
    expect(mocks.buildGuardrailInputProcessors).toHaveBeenCalledTimes(1);
    expect(mocks.buildGuardrailInputProcessors).toHaveBeenCalledWith({
      settings: { aiApiKeys: settings.aiApiKeys, chatModel: settings.chatModel },
      env,
      strategy: 'block',
      mode: 'strict',
    });
    // The plan-built processors back the conversational agent.
    expect(mocks.createXauusdMastraAgent).toHaveBeenCalledWith(
      expect.objectContaining({ inputProcessors: ['guardrail-processor'] }),
    );
  });

  it('falls back to the canonical strict + block defaults without a plan', async () => {
    const generate = vi.fn().mockResolvedValue({ text: 'guarded answer' });
    mocks.createXauusdMastraAgent.mockReturnValue({ generate });

    await runXauusdMastraConversation({
      prompt: 'Explain the current gold context',
      userId: 'user-1',
      threadId: 'thread-1',
      runId: 'conversation-default-1',
      settings,
      env,
    });

    expect(mocks.buildGuardrailInputProcessors).toHaveBeenCalledWith(
      expect.objectContaining({ strategy: 'block', mode: 'strict' }),
    );
  });

  it('derives the XAUUSD report path guardrails from the execution plan policy (§1.9)', async () => {
    const generate = vi.fn().mockResolvedValue({ text: 'grounded result', object: {} });
    mocks.createXauusdMastraAgent.mockReturnValue({ generate });

    const result = await runXauusdMastra({
      prompt: 'Analyse gold',
      userId: 'user-1',
      threadId: 'thread-1',
      runId: 'report-plan-1',
      settings,
      env,
      executionPlan: planFor('xauusd-research'),
    });

    expect(result.answerOutcome).toBe('ready');
    // Both the followup (conversation) and report (research) guardrail sets
    // derive from the single plan-derived policy — the §1.9 consistency fix.
    expect(mocks.buildGuardrailInputProcessors).toHaveBeenCalledTimes(2);
    for (const [options] of mocks.buildGuardrailInputProcessors.mock.calls) {
      expect(options).toMatchObject({ strategy: 'block', mode: 'strict' });
    }
  });

  it('fails closed when follow-up mode is requested without a prior report', async () => {
    mocks.createXauusdMastraAgent.mockReturnValue({ generate: vi.fn() });

    await expect(
      runXauusdMastra({
        prompt: 'What does your report say about invalidation?',
        userId: 'user-1',
        threadId: 'thread-1',
        runId: 'followup-missing',
        settings,
        env,
        turnMode: 'followup',
      }),
    ).rejects.toThrow('XAUUSD follow-up mode requires a prior verified report');
    expect(mocks.generateXauusdFollowup).not.toHaveBeenCalled();
  });

  it('answers follow-ups from the saved report instead of a fresh verified report', async () => {
    const generate = vi.fn().mockResolvedValue({ text: 'followup answer' });
    mocks.createXauusdMastraAgent.mockReturnValue({ generate });
    const followupResult = { text: 'from the saved report' };
    mocks.generateXauusdFollowup.mockResolvedValue(followupResult);
    const priorReport = {
      symbol: 'XAUUSD',
      asOf: '2026-07-01T00:00:00.000Z',
      dataQuality: 'complete',
    } as never;

    const result = await runXauusdMastra({
      prompt: 'What does your report say about invalidation?',
      userId: 'user-1',
      threadId: 'thread-1',
      runId: 'followup-1',
      settings,
      env,
      turnMode: 'followup',
      priorReport,
    });

    // Follow-up mode returns the conversational answer, never a new report.
    expect(result.result).toBe(followupResult);
    expect(result.report).toBeNull();
    // No fresh report workflow run: the followup generator was used directly.
    expect(mocks.generateXauusdFollowup).toHaveBeenCalledTimes(1);
    expect(generate).not.toHaveBeenCalled();
    const followupArgs = mocks.generateXauusdFollowup.mock.calls[0]!;
    // The followup agent carries the conversation policy (no structured output).
    expect(mocks.createXauusdMastraAgent).toHaveBeenCalledWith(expect.objectContaining({ model }));
    expect(followupArgs[3]).toBe('google');
  });

  it('preserves generation failures and records a failed terminal outcome', async () => {
    const error = new Error('provider unavailable');
    mocks.createXauusdMastraAgent.mockReturnValue({
      generate: vi.fn().mockRejectedValue(error),
    });

    // The failure surfaces through the workflow run: Mastra wraps step errors,
    // so the rejected error preserves message/name but is not the same instance.
    await expect(
      runXauusdMastra({
        prompt: 'Analyse gold',
        userId: 'user-1',
        threadId: 'thread-1',
        runId: 'run-2',
        settings,
        env,
      }),
    ).rejects.toMatchObject({ message: 'provider unavailable' });

    // Mastra serializes step failures, so the surfaced error is a plain
    // { message, name } object rather than the original Error instance.
    expect(mocks.mastraOutcomeForError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'provider unavailable' }),
      undefined,
    );
    expect(mocks.finishMastraRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run-2',
        outcome: 'failed',
        error: expect.objectContaining({ message: 'provider unavailable' }),
      }),
    );
  });
});
