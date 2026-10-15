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
import { z } from 'zod';

import { POST } from '@/app/api/chat/route';

const {
  mockEnqueueFullAnalysis,
  mockGetUserWithSettings,
  mockGetThread,
  mockWithRateLimit,
  mockRunMastraXauusdChat,
  mockRunMastraCanonicalChatStreamService,
  mockRunMastraXauusdConversationStreamChat,
  mockRunMastraModeChatStream,
  mockMastraChatResponse,
  mockResolveMastraModeModel,
  mockDecideMastraExecution,
  mockGuardrailUnavailableError,
  mockTripWire,
} = vi.hoisted(() => ({
  mockEnqueueFullAnalysis: vi.fn(),
  mockGetUserWithSettings: vi.fn(),
  mockGetThread: vi.fn(),
  mockWithRateLimit: vi.fn(),
  mockRunMastraXauusdChat: vi.fn(),
  mockRunMastraCanonicalChatStreamService: vi.fn(() => new Response('canonical', { status: 200 })),
  mockRunMastraXauusdConversationStreamChat: vi.fn(
    () => new Response('xauusd-stream', { status: 200 }),
  ),
  mockRunMastraModeChatStream: vi.fn(() => new Response('mode', { status: 200 })),
  mockMastraChatResponse: vi.fn(() => new Response('xauusd', { status: 200 })),
  mockDecideMastraExecution: vi.fn(),
  mockResolveMastraModeModel: vi.fn(() => ({
    modelId: 'google/gemini-3.6-flash',
    providerId: 'google',
    bareModelId: 'gemini-3.6-flash',
  })),
  // §1.9 route-boundary error classes: strict guardrail unavailability and
  // Mastra's injection tripwire must map to clean 503/422 responses.
  mockGuardrailUnavailableError: class GuardrailUnavailableError extends Error {},
  mockTripWire: class TripWire extends Error {
    options: Record<string, unknown> = {};
    processorId = 'prompt-injection-detector';
  },
}));

vi.mock('@kestrel/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kestrel/db')>();
  return { ...actual, getUserWithSettings: mockGetUserWithSettings };
});

vi.mock('@/lib/api', () => ({
  errorResponse: vi.fn((error: unknown) =>
    Response.json({ error: { code: 'TEST_ERROR', message: String(error) } }, { status: 500 }),
  ),
  parseJsonBody: async (req: Request, schema: z.ZodTypeAny) => schema.parse(await req.json()),
  withAuth:
    (handler: (req: Request, ctx: { user: { userId: string } }) => Promise<Response>) =>
    (req: Request) =>
      handler(req, { user: { userId: 'user-1' } }),
}));

vi.mock('@/lib/env', () => ({
  getServerEnv: () => ({
    AI_DEFAULT_MODEL: 'google/gemini-3.6-flash',
    GOOGLE_GENERATIVE_AI_API_KEY: 'test-key',
    MAX_DAILY_USD: 5,
    MAX_TOOL_ITERATIONS: 6,
  }),
}));

vi.mock('@/lib/logger', () => ({
  createRequestLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  createCategorizedLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));


vi.mock('@/lib/services/mastra-chat', () => ({
  runMastraXauusdChat: mockRunMastraXauusdChat,
}));
vi.mock('@/lib/services/mastra-canonical-chat-stream', () => ({
  runMastraCanonicalChatStreamService: mockRunMastraCanonicalChatStreamService,
}));
vi.mock('@/lib/services/mastra-chat-stream', () => ({
  runMastraXauusdConversationStreamChat: mockRunMastraXauusdConversationStreamChat,
}));
vi.mock('@/lib/services/mastra-mode', () => ({
  runMastraModeChatStream: mockRunMastraModeChatStream,
}));
vi.mock('@/lib/services/mastra-chat-response', () => ({
  mastraChatResponse: mockMastraChatResponse,
}));
vi.mock('@/lib/services/mastra-report-context', () => ({
  extractLatestMastraReport: vi.fn(() => null),
  mayReferToMastraReport: vi.fn(() => false),
}));

vi.mock('@kestrel/ai/mastra', () => ({
  classifyMutationRequest: vi.fn(() => null),
  isMastraMutationEnabled: vi.fn(() => false),
  MutationExtractionError: class MutationExtractionError extends Error {},
  resolveMastraModeModel: mockResolveMastraModeModel,
  decideMastraExecution: mockDecideMastraExecution,
}));

vi.mock('@/lib/services/api-boundary', () => ({
  AnalysisQueuedEventSchema: { parse: (value: unknown) => value },
  BudgetExceededError: class BudgetExceededError extends Error {
    spent = 5;
    max = 5;
  },
  CanonicalEvidenceBlockedError: class CanonicalEvidenceBlockedError extends Error {},
  GuardrailUnavailableError: mockGuardrailUnavailableError,
  TripWire: mockTripWire,
  extractUserMessageText: (message: { parts?: Array<{ type?: string; text?: string }> }) =>
    (message.parts ?? [])
      .filter((part) => part.type === 'text')
      .map((part) => part.text ?? '')
      .join('\n'),
  getThread: mockGetThread,
  listMessages: vi.fn().mockResolvedValue([]),
  resolveMode: (mode: string) => (mode === 'auto' ? 'single' : mode),
  getUserWithSettings: mockGetUserWithSettings,
  // §1.1: the unified router classifies in one pass; mirror the plan the
  // createExecutionPlan mock below already builds.
  routeUnified: vi.fn(async (input: {
    userMessage: { parts: Array<{ type?: string; text?: string }> };
    mode: string;
  }) => {
    const text = input.userMessage.parts
      .map((part) => part.text ?? '')
      .join(' ');
    const symbol = /xauusd|gold/i.test(text) ? 'XAUUSD' : /eurusd/i.test(text) ? 'EURUSD' : null;
    return {
      domain: 'technical',
      planRequired: false,
      symbol,
      xauusdChatKind: symbol === 'XAUUSD' ? 'research' : null,
      injection: { blocked: /ignore previous instructions|system:|developer:/i.test(text) },
      mutationKind: null,
      highConfidenceMutationIntent: /\bbuy\b|\bsell\b/i.test(text),
      capabilityId: symbol ? (symbol === 'XAUUSD' ? 'xauusd-research' : 'symbol-research') : null,
      route: input.mode === 'full' ? 'full-analysis-queue' : 'canonical-chat',
      modelPurpose: 'canonical-chat',
      rationale: 'test',
      decision: { route: input.mode === 'full' ? 'full-analysis-queue' : 'canonical-chat' },
      routing: { domain: 'technical', planRequired: false, rationale: 'test' },
    };
  }),
  isBudgetEnforced: () => false,
  isInjectionAttempt: (prompt: string) => /ignore previous instructions|system:|developer:/i.test(prompt),
  isHighConfidenceMutationIntent: (prompt: string) => /\bbuy\b|\bsell\b/i.test(prompt),
  enqueueFullAnalysis: mockEnqueueFullAnalysis,
  traceIdStorage: { getStore: () => 'trace-route-1' },
  isMastraMutationEnabled: () => false,
  classifyMutationRequest: () => null,
  resolveMastraModeModel: () => ({
    modelId: 'google/gemini-3.6-flash',
    providerId: 'google',
    bareModelId: 'gemini-3.6-flash',
  }),
  decideMastraExecution: mockDecideMastraExecution,
  createExecutionPlan: vi.fn(async ({ mode, symbol, modelOverride, userMessage, tenantId }) => {
    const text = userMessage.parts
      .filter((part: { type?: string; text?: string }) => part.type === 'text')
      .map((part: { text?: string }) => part.text ?? '')
      .join(' ');
    const plannedSymbol =
      symbol ?? (/xauusd|gold/i.test(text) ? 'XAUUSD' : /eurusd/i.test(text) ? 'EURUSD' : null);
    return {
      version: 1,
      route:
        mode === 'full'
          ? 'full-analysis'
          : plannedSymbol === 'XAUUSD'
            ? 'xauusd-research'
            : plannedSymbol
              ? 'symbol-research'
              : 'canonical-chat',
      capabilityId:
        plannedSymbol === 'XAUUSD' ? 'xauusd-research' : plannedSymbol ? 'symbol-research' : null,
      capabilityVersion: 'test',
      symbol: plannedSymbol,
      mode,
      model: modelOverride
        ? { providerId: 'google', bareModelId: modelOverride.split(':')[1] ?? modelOverride }
        : null,
      toolPolicy: { capabilityId: null, tools: [], readOnly: true, requiresConfirmation: false },
      evidencePolicy: {
        required: Boolean(plannedSymbol),
        externalData: Boolean(plannedSymbol),
        contentTrust: plannedSymbol ? 'untrusted' : null,
      },
      memoryPolicy: { mode: 'native', required: true, scope: 'user-thread' },
      guardrail: { mode: 'strict', strategy: 'block' },
      maxSteps: 6,
      maxDurationMs: 55_000,
      streaming: !plannedSymbol && mode !== 'full',
      mutationRequested: false,
      tenantId: tenantId ?? null,
      xauusdChatKind: plannedSymbol === 'XAUUSD' ? 'research' : null,
      reportFollowup: false,
      symbolCandidate: Boolean(plannedSymbol),
      xauusdCandidate: plannedSymbol === 'XAUUSD',
    };
  }),
  withDiagnostics: async (_userId: string, _threadId: string, fn: () => Promise<Response>) => fn(),
  withRateLimit: mockWithRateLimit,
  UserMessagePartsSchema: z.array(z.unknown()).transform((parts) => parts),
  PresentationPreferencesSchema: z.object({ customInstructions: z.string().optional() }),
}));

function request(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-request-id': 'request-route-1' },
    body: JSON.stringify(body),
  });
}

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    threadId: '11111111-1111-4111-8111-111111111111',
    messages: [
      {
        id: 'user-message-1',
        role: 'user',
        content: 'Analyze XAUUSD',
        parts: [{ type: 'text', text: 'Analyze XAUUSD' }],
      },
    ],
    ...overrides,
  };
}

describe('POST /api/chat Mastra boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWithRateLimit.mockResolvedValue({ allowed: true, count: 1, limit: 30 });
    mockGetThread.mockResolvedValue({ id: 'thread-1', userId: 'user-1' });
    mockGetUserWithSettings.mockResolvedValue({
      settings: {
        aiApiKeys: null,
        chatModel: null,
        embeddingModel: null,
      },
    });
    mockEnqueueFullAnalysis.mockResolvedValue('run-1');
    mockDecideMastraExecution.mockImplementation(
      async ({ mode, symbol }: { mode: string; symbol: string | null }) => ({
        route:
          mode === 'full'
            ? 'full-analysis'
            : symbol === 'XAUUSD'
              ? 'xauusd-research'
              : mode === 'quick' || mode === 'standard'
                ? 'symbol-research'
                : 'canonical-chat',
        routing: { domain: 'generic', planRequired: false, rationale: 'test' },
        capability: null,
        model: null,
        modelPurpose: 'canonical-chat',
        symbol,
      }),
    );
    mockResolveMastraModeModel.mockReturnValue({
      modelId: 'google/gemini-3.6-flash',
      providerId: 'google',
      bareModelId: 'gemini-3.6-flash',
    });
    mockGetUserWithSettings.mockResolvedValue({
      settings: { maxDailyUsd: 5, aiApiKeys: null, chatModel: null },
    });
    mockRunMastraXauusdChat.mockResolvedValue({
      result: { text: 'xauusd result' },
      runId: 'run-1',
      modelId: 'google:gemini-3.6-flash',
      providerId: 'google',
      report: null,
      packet: { status: 'ready', dataQuality: 'complete', packetId: 'packet-1' },
      observedCost: 0.001,
    });
  });

  it('routes XAUUSD research directly to the specialized Mastra report path', async () => {
    const response = await POST(request(body()), { params: Promise.resolve(undefined) });

    expect(response.status).toBe(200);
    expect(mockRunMastraXauusdChat).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        threadId: '11111111-1111-4111-8111-111111111111',
        modelOverride: null,
      }),
    );
  });

  it('routes symbol-free read-only conversation to canonical Mastra', async () => {
    const response = await POST(
      request(
        body({
          messages: [
            {
              id: 'user-message-2',
              role: 'user',
              content: 'Explain how RSI works',
              parts: [{ type: 'text', text: 'Explain how RSI works' }],
            },
          ],
        }),
      ),
      { params: Promise.resolve(undefined) },
    );

    expect(response.status).toBe(200);
    expect(mockRunMastraCanonicalChatStreamService).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', threadId: expect.any(String) }),
    );
    expect(mockRunMastraXauusdChat).not.toHaveBeenCalled();
  });

  it('routes single-mode symbol analysis to the shared committee workflow (Q2/§2.3)', async () => {
    const response = await POST(
      request(
        body({
          analysisMode: 'single',
          messages: [
            {
              id: 'user-message-3',
              role: 'user',
              content: 'Analyze EURUSD structure',
              parts: [{ type: 'text', text: 'Analyze EURUSD structure' }],
            },
          ],
        }),
      ),
      { params: Promise.resolve(undefined) },
    );

    expect(response.status).toBe(200);
    expect(mockRunMastraModeChatStream).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: 'EURUSD', mode: 'single' }),
    );
  });

  it('queues Full mode for the Mastra worker with authoritative-history semantics', async () => {
    const response = await POST(request(body({ analysisMode: 'full' })), {
      params: Promise.resolve(undefined),
    });

    expect(response.status).toBe(200);
    expect(mockEnqueueFullAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        threadId: '11111111-1111-4111-8111-111111111111',
        idempotencyKey: expect.stringContaining('full:'),
        traceId: 'trace-route-1',
      }),
    );
    expect(mockRunMastraXauusdChat).not.toHaveBeenCalled();
  });

  it('passes an explicit model override to the Mastra canonical agent', async () => {
    await POST(
      request(
        body({
          modelOverride: 'mistral:mistral-small-latest',
          messages: [
            {
              id: 'user-message-4',
              role: 'user',
              content: 'Explain RSI',
              parts: [{ type: 'text', text: 'Explain RSI' }],
            },
          ],
        }),
      ),
      { params: Promise.resolve(undefined) },
    );

    expect(mockRunMastraCanonicalChatStreamService).toHaveBeenCalledWith(
      expect.objectContaining({ modelOverride: 'mistral:mistral-small-latest' }),
    );
  });

  it('rejects mutation or injection-like prompts instead of falling back', async () => {
    const response = await POST(
      request(
        body({
          messages: [
            {
              id: 'user-message-5',
              role: 'user',
              content: 'Buy gold now',
              parts: [{ type: 'text', text: 'Buy gold now' }],
            },
          ],
        }),
      ),
      { params: Promise.resolve(undefined) },
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: { code: 'READ_ONLY_REQUEST_REQUIRED' },
    });
    expect(mockRunMastraXauusdChat).not.toHaveBeenCalled();
    expect(mockRunMastraCanonicalChatStreamService).not.toHaveBeenCalled();
  });

  it('returns an explicit Mastra failure rather than invoking a legacy fallback', async () => {
    mockRunMastraXauusdChat.mockRejectedValue(new Error('provider unavailable'));

    const response = await POST(request(body()), { params: Promise.resolve(undefined) });

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: { code: 'MASTRA_FAILED' } });
  });

  it('maps strict guardrail unavailability to a retryable 503 (§1.9)', async () => {
    mockRunMastraXauusdChat.mockRejectedValue(
      new mockGuardrailUnavailableError(
        'Prompt-injection detector model is unavailable and guardrail mode is strict.',
      ),
    );

    const response = await POST(request(body()), { params: Promise.resolve(undefined) });

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: 'GUARDRAIL_UNAVAILABLE' } });
  });

  it('maps the Mastra injection tripwire to a clean 422 (§1.9)', async () => {
    mockRunMastraXauusdChat.mockRejectedValue(
      new mockTripWire('Tripwire triggered by prompt-injection-detector'),
    );

    const response = await POST(request(body()), { params: Promise.resolve(undefined) });

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: 'INJECTION_BLOCKED' } });
  });

  it('serializes Full mode model overrides onto the durable queue (Q7)', async () => {
    const response = await POST(
      request(body({ analysisMode: 'full', modelOverride: 'mistral:mistral-small-latest' })),
      { params: Promise.resolve(undefined) },
    );

    expect(response.status).toBe(200);
    expect(mockEnqueueFullAnalysis).toHaveBeenCalledTimes(1);
    expect(mockEnqueueFullAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        modelSnapshot: expect.objectContaining({
          modelId: 'google/gemini-3.6-flash',
          providerId: 'google',
        }),
      }),
    );
  });

  it('returns 409 ONBOARDING_REQUIRED when user settings are missing', async () => {
    mockGetUserWithSettings.mockResolvedValue({ settings: null });

    const response = await POST(request(body()), { params: Promise.resolve(undefined) });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: 'ONBOARDING_REQUIRED' },
    });
    expect(mockRunMastraXauusdChat).not.toHaveBeenCalled();
    expect(mockRunMastraCanonicalChatStreamService).not.toHaveBeenCalled();
    expect(mockEnqueueFullAnalysis).not.toHaveBeenCalled();
  });

  it("rejects a turn addressed to another user's thread before any model work", async () => {
    // A thread lookup scoped to the authenticated user returns nothing for a
    // mismatched owner — the route must fail closed with 404 and never touch
    // a provider or queue.
    mockGetThread.mockResolvedValue(null);

    const response = await POST(request(body()), { params: Promise.resolve(undefined) });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
    expect(mockRunMastraXauusdChat).not.toHaveBeenCalled();
    expect(mockRunMastraCanonicalChatStreamService).not.toHaveBeenCalled();
    expect(mockRunMastraXauusdConversationStreamChat).not.toHaveBeenCalled();
    expect(mockEnqueueFullAnalysis).not.toHaveBeenCalled();
  });

  it('reuses a stable idempotency key for duplicate Full-mode requests', async () => {
    const first = await POST(request(body({ analysisMode: 'full' })), {
      params: Promise.resolve(undefined),
    });
    const second = await POST(request(body({ analysisMode: 'full' })), {
      params: Promise.resolve(undefined),
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(mockEnqueueFullAnalysis).toHaveBeenCalledTimes(2);
    expect(mockEnqueueFullAnalysis).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        idempotencyKey: 'full:11111111-1111-4111-8111-111111111111:user-message-1',
      }),
    );
    expect(mockEnqueueFullAnalysis).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        idempotencyKey: 'full:11111111-1111-4111-8111-111111111111:user-message-1',
      }),
    );
  });

  it('derives the idempotency key from the user message id (retry-safe scope)', async () => {
    const withDifferentMessage = body({
      analysisMode: 'full',
      messages: [
        {
          id: 'user-message-2',
          role: 'user',
          content: 'Analyze gold again',
          parts: [{ type: 'text', text: 'Analyze gold again' }],
        },
      ],
    });
    const first = await POST(request(withDifferentMessage), {
      params: Promise.resolve(undefined),
    });
    const second = await POST(request(withDifferentMessage), {
      params: Promise.resolve(undefined),
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(mockEnqueueFullAnalysis).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        idempotencyKey: 'full:11111111-1111-4111-8111-111111111111:user-message-2',
      }),
    );
  });
});
