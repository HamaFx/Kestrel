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

// R14 — the custom-agent stream previously had no retry. This pins the
// bounded retry on the standalone-agent path and the honest completion
// metadata (model actually used).

import { describe, expect, it, vi } from 'vitest';

import { runCustomAgentStream } from '../src/plugins/agent-runtime';

const mocks = vi.hoisted(() => ({
  buildCustomAgent: vi.fn(),
  beginMastraRun: vi.fn(),
  finishMastraRun: vi.fn().mockResolvedValue(undefined),
  runTracingOptions: vi.fn(() => ({})),
  resolveFallbackChain: vi.fn(() => []),
}));

vi.mock('../src/plugins/agent-builder', () => ({
  buildCustomAgent: mocks.buildCustomAgent,
}));

vi.mock('../src/mastra-v2/shared/telemetry', async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    '../src/mastra-v2/shared/telemetry',
  );
  return {
    ...actual,
    beginMastraRun: mocks.beginMastraRun,
    finishMastraRun: mocks.finishMastraRun,
  };
});

vi.mock('../src/mastra-v2/telemetry', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../src/mastra-v2/telemetry');
  return { ...actual, runTracingOptions: mocks.runTracingOptions };
});

vi.mock('../src/mastra-v2/memory', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../src/mastra-v2/memory');
  return { ...actual, KESTREL_MEMORY_LAST_MESSAGES: 20 };
});

vi.mock('../src/models/model', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../src/models/model');
  return { ...actual, resolveFallbackChain: mocks.resolveFallbackChain };
});

function builtAgentWith(stream: ReturnType<typeof vi.fn>) {
  return {
    agent: { stream },
    descriptor: { agent: { slug: 'tester' } },
    resolution: {
      model: {},
      modelId: 'google/gemini-2.5-flash',
      providerId: 'google',
      bareModelId: 'gemini-2.5-flash',
    },
    modelId: 'google/gemini-2.5-flash',
    providerId: 'google',
    modelSnapshot: { providerId: 'google', bareModelId: 'gemini-2.5-flash' },
    memory: null,
    callMemory: null,
    memoryMode: 'native',
    memoryBackfill: false,
    requestContext: { get: (key: string) => (key === 'runId' ? 'run-custom-1' : undefined) },
    toolContext: {
      threadId: 'thread-1',
      userId: 'user-1',
      env: {},
      signal: null,
      budget: { spent: 0, max: 5 },
      userSettings: {},
      toolTelemetryBuffer: [],
    },
    toolPartsBuffer: [],
  };
}

const SUCCESS_OUTPUT = {
  textStream: (async function* () {
    yield 'hello ';
    yield 'world';
  })(),
  getFullOutput: async () => ({
    text: 'hello world',
    response: { messages: [] },
    totalUsage: { inputTokens: 1, outputTokens: 2 },
    steps: [],
  }),
};

function customAgentArgs() {
  return {
    runtime: {},
    descriptor: { agent: { slug: 'tester' } },
    settings: { aiApiKeys: null },
    env: {},
    userId: 'user-1',
    threadId: 'thread-1',
    userMessage: { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] },
    history: [],
    prompt: 'hi',
  } as never;
}

describe('custom-agent stream retry (R14)', () => {
  it('retries a transient 429 once and completes with the streamed answer', async () => {
    const stream = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('rate limited'), { statusCode: 429 }))
      .mockResolvedValue(SUCCESS_OUTPUT);
    mocks.buildCustomAgent.mockResolvedValue(builtAgentWith(stream));

    const result = await runCustomAgentStream(customAgentArgs());
    const chunks: string[] = [];
    for await (const chunk of result.text) chunks.push(chunk);
    const completion = await result.completion;

    expect(stream).toHaveBeenCalledTimes(2);
    expect(chunks.join('')).toBe('hello world');
    expect(completion.text).toBe('hello world');
    expect(completion.modelId).toBe('google/gemini-2.5-flash');
    expect(completion.fallbackParts).toBeUndefined();
  });

  it('does not retry a hard 400', async () => {
    const stream = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('bad request'), { statusCode: 400 }));
    mocks.buildCustomAgent.mockResolvedValue(builtAgentWith(stream));

    await expect(runCustomAgentStream(customAgentArgs())).rejects.toThrow('bad request');
    expect(stream).toHaveBeenCalledTimes(1);
    // The terminal run is attributed to the model that actually failed so the
    // breaker can learn from it.
    expect(mocks.finishMastraRun).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'google/gemini-2.5-flash',
        providerId: 'google',
        outcome: 'failed',
      }),
    );
  });
});
