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

// R14 — end-to-end wiring proof for the canonical streaming chat: a 429 on the
// primary model continues the same turn on the next configured model, both
// attempts stay in one Turn/budget, and the completion is honest about the
// model that answered plus the emitted data-fallback part.

import { container } from '@kestrel/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runMastraCanonicalChatStream } from '../src/mastra-v2/agents/canonical';
import { _resetCircuits } from '../src/models/circuit-breaker';
import { DB } from '../src/runtime/tokens';

container.register(DB, () => ({ select: () => undefined }) as never);

const mocks = vi.hoisted(() => ({
  beginMastraRun: vi.fn(),
  finishMastraRun: vi.fn().mockResolvedValue(undefined),
  stream: vi.fn(),
  fallbackModel: { marker: 'anthropic-model' },
}));

vi.mock('../src/diagnostics/trace-persistence', () => ({
  persistTrace: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/mastra-v2/agents/canonical/setup', () => ({
  setupCanonicalChat: async (args: { userId: string; threadId: string; runId?: string }) => ({
    runId: args.runId ?? 'run-canonical-fallback',
    agent: { stream: mocks.stream, generate: vi.fn() },
    routing: { domain: 'generic', planRequired: false, rationale: 'fallback test' },
    resolution: {
      model: { marker: 'primary-model' },
      modelId: 'google/gemini-2.5-flash',
      providerId: 'google',
      bareModelId: 'gemini-2.5-flash',
    },
    callMemory: null,
    requestContext: {},
    toolPartsBuffer: [],
    context: {
      threadId: args.threadId,
      userId: args.userId,
      latestUserMessageText: 'fallback test',
      env: {},
      signal: null,
      budget: { spent: 0, max: 5 },
      userSettings: {},
    },
    messages: [],
    scorers: { entries: {} },
    memoryDegraded: false,
    memoryBackfill: false,
  }),
}));

vi.mock('../src/models/model', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../src/models/model');
  return {
    ...actual,
    resolveFallbackChain: () => [
      {
        providerId: 'anthropic',
        bareModelId: 'claude-sonnet-4',
        modelId: 'anthropic/claude-sonnet-4',
        model: mocks.fallbackModel,
      },
    ],
  };
});

vi.mock('../src/mastra-v2/shared/telemetry', async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    '../src/mastra-v2/shared/telemetry',
  );
  return {
    ...actual,
    beginMastraRun: mocks.beginMastraRun,
    finishMastraRun: mocks.finishMastraRun,
    createMastraRunFinalizer: () => mocks.finishMastraRun,
  };
});

const settings = {
  aiApiKeys: null,
  chatModel: null,
  embeddingModel: null,
  maxDailyUsd: 5,
} as never;
const env = {
  GOOGLE_GENERATIVE_AI_API_KEY: 'test-key',
  AI_DEFAULT_MODEL: 'google/gemini-2.5-flash',
  MAX_TOOL_ITERATIONS: 6,
} as never;

function fullOutput(text: string) {
  return {
    text,
    usage: { inputTokens: 10, outputTokens: 5 },
    steps: [{}],
    response: { messages: [] },
  };
}

describe('canonical stream mid-turn fallback (R14)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetCircuits();
  });

  it('continues on the fallback model after a 429 and reports the switch', async () => {
    mocks.stream
      .mockRejectedValueOnce(Object.assign(new Error('rate limited'), { statusCode: 429 }))
      // The same-model retry also hits the rate limit, so the turn must move
      // to the next configured provider.
      .mockRejectedValueOnce(Object.assign(new Error('rate limited'), { statusCode: 429 }))
      .mockResolvedValue({
        textStream: (async function* () {
          yield 'continued ';
          yield 'answer';
        })(),
        getFullOutput: async () => fullOutput('continued answer'),
      });

    const run = await runMastraCanonicalChatStream({
      userId: 'user-1',
      threadId: 'thread-1',
      userMessage: {
        id: 'message-1',
        role: 'user',
        parts: [{ type: 'text', text: 'explain RSI divergence' }],
      },
      history: [],
      settings,
      env,
      runId: 'run-canonical-fallback',
    });

    const chunks: string[] = [];
    for await (const chunk of run.text) chunks.push(chunk);
    const completion = await run.completion;

    // Two rate-limited attempts on the primary, then one on the fallback.
    expect(mocks.stream).toHaveBeenCalledTimes(3);
    const thirdOptions = mocks.stream.mock.calls[2]![1] as { model?: unknown };
    expect(thirdOptions.model).toBe(mocks.fallbackModel);

    // The answer came from the fallback model and says so.
    expect(chunks.join('')).toBe('continued answer');
    expect(completion.text).toBe('continued answer');
    expect(completion.modelId).toBe('anthropic/claude-sonnet-4');
    expect(completion.providerId).toBe('anthropic');
    expect(completion.fallbackParts).toEqual([
      expect.objectContaining({
        type: 'data-fallback',
        reason: 'rate-limit',
        override: 'google/gemini-2.5-flash',
      }),
    ]);

    // One terminal run record, for the model that actually answered.
    expect(mocks.finishMastraRun).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'anthropic/claude-sonnet-4',
        providerId: 'anthropic',
        outcome: 'success',
      }),
    );
  });

  it('fails the turn as before when the failure is not recoverable', async () => {
    mocks.stream.mockRejectedValue(Object.assign(new Error('bad request'), { statusCode: 400 }));

    await expect(
      runMastraCanonicalChatStream({
        userId: 'user-1',
        threadId: 'thread-1',
        userMessage: {
          id: 'message-2',
          role: 'user',
          parts: [{ type: 'text', text: 'explain RSI divergence' }],
        },
        history: [],
        settings,
        env,
        runId: 'run-canonical-hard-error',
      }),
    ).rejects.toThrow('bad request');

    expect(mocks.stream).toHaveBeenCalledTimes(1);
    // One terminal record for the primary model that failed.
    expect(mocks.finishMastraRun).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'google/gemini-2.5-flash',
        providerId: 'google',
        outcome: 'failed',
      }),
    );
  });
});
