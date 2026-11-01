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

// Audit 2026-10-31 (R7 follow-up) — custom-agent runs hand Mastra (and its
// durable memory) the messages it persists, so they must keep the storage
// reference. This also pins that the current turn's attachment is carried at
// all, in both the native-memory and explicit-history branches; the bytes are
// added later by the provider-boundary middleware.

import { afterEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('../src/models/model', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../src/models/model');
  return { ...actual, resolveFallbackChain: mocks.resolveFallbackChain };
});

const STORAGE_PATH = 'user-1/2026-11-01/ab12cd34ef56-chart.png';
const PROXY_URL = `https://app.example.com/api/uploads/${STORAGE_PATH}`;
const FOREIGN_URL = 'https://images.example.com/chart.png';

const SUCCESS_OUTPUT = {
  textStream: (async function* () {
    yield 'ok';
  })(),
  getFullOutput: async () => ({
    text: 'ok',
    response: { messages: [] },
    totalUsage: { inputTokens: 1, outputTokens: 1 },
    steps: [],
  }),
};

function builtAgentWith(stream: ReturnType<typeof vi.fn>, callMemory: unknown = null) {
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
    memory: callMemory,
    callMemory,
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

function customAgentArgs(url: string) {
  return {
    runtime: {},
    descriptor: { agent: { slug: 'tester' } },
    settings: { aiApiKeys: null },
    env: {},
    userId: 'user-1',
    threadId: 'thread-1',
    userMessage: {
      id: 'm1',
      role: 'user',
      parts: [
        { type: 'file', url, mediaType: 'image/png', filename: 'chart.png' },
        { type: 'text', text: 'analyse @tester' },
      ],
    },
    history: [],
    prompt: 'analyse this chart',
  } as never;
}

async function streamedModelMessages(url: string, callMemory: unknown = null): Promise<unknown> {
  const stream = vi.fn().mockResolvedValue(SUCCESS_OUTPUT);
  mocks.buildCustomAgent.mockResolvedValue(builtAgentWith(stream, callMemory));

  const result = await runCustomAgentStream(customAgentArgs(url));
  for await (const _chunk of result.text) {
    // drain
  }
  await result.completion;

  return stream.mock.calls[0]![0];
}

function expectNoInlineImages(value: unknown): void {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toContain('data:image');
  expect(serialized).not.toMatch(/;\s*base64,/);
}

describe('custom-agent image references (R7 follow-up)', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mocks.resolveFallbackChain.mockReturnValue([]);
    mocks.finishMastraRun.mockResolvedValue(undefined);
  });

  it("carries the current turn's proxy-URL attachment as a reference", async () => {
    const messages = await streamedModelMessages(PROXY_URL);
    const serialized = JSON.stringify(messages);

    expect(serialized).toContain(PROXY_URL);
    expect(serialized).toContain('analyse this chart');
    expectNoInlineImages(messages);
  });

  it('carries the reference when native memory is active', async () => {
    const messages = await streamedModelMessages(PROXY_URL, { threadId: 'thread-1' });

    expect(JSON.stringify(messages)).toContain(PROXY_URL);
    expectNoInlineImages(messages);
  });

  it('keeps a foreign attachment reference untouched', async () => {
    const messages = await streamedModelMessages(FOREIGN_URL);

    expect(JSON.stringify(messages)).toContain(FOREIGN_URL);
    expectNoInlineImages(messages);
  });
});
