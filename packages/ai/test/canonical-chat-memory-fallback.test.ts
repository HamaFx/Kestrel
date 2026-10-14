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

// Audit plan §1.5 (P1-5) — canonical chat must survive a transient memory-store
// failure: fall back to the explicit-history path, mark the run degraded, and
// still return the answer instead of a naked 502.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { container } from '@kestrel/shared';

import { DB } from '../src/tokens';

// ToolContext resolves the DB lazily; no tool calls run in these tests, so a
// stub client is enough. Register before any turn executes.
container.register(DB, () => ({ select: () => undefined }) as never);

const mocks = vi.hoisted(() => ({
  resolveChatModel: vi.fn(),
  resolveMastraModel: vi.fn(),
  resolveMastraExecutionModel: vi.fn(),
  resolveEmbeddingModel: vi.fn(() => 'openai/text-embedding-3-small'),
  prepareKestrelMemory: vi.fn(),
  finishMastraRun: vi.fn().mockResolvedValue(undefined),
  beginMastraRun: vi.fn(),
  generate: vi.fn(),
  prepareFails: false,
}));

vi.mock('../src/model', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../src/model');
  return {
    ...actual,
    resolveChatModel: mocks.resolveChatModel,
    resolveMastraModel: mocks.resolveMastraModel,
    resolveMastraExecutionModel: mocks.resolveMastraExecutionModel,
    resolveEmbeddingModel: mocks.resolveEmbeddingModel,
  };
});

vi.mock('../src/mastra-v2/context', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../src/mastra-v2/context');
  return { ...actual, prepareKestrelMemory: mocks.prepareKestrelMemory };
});

vi.mock('../src/mastra-v2/shared/telemetry', () => ({
  beginMastraRun: mocks.beginMastraRun,
  finishMastraRun: mocks.finishMastraRun,
  createMastraRunFinalizer: () => mocks.finishMastraRun,
  getMastraGenerationStats: () => ({ inputTokens: 10, outputTokens: 5, toolCalls: 0, steps: 1 }),
  mastraOutcomeForError: (error: unknown, signal?: AbortSignal) =>
    signal?.aborted || (error instanceof Error && error.name === 'AbortError')
      ? 'cancelled'
      : 'failed',
}));

vi.mock('@mastra/core/agent', () => ({
  Agent: class {
    readonly id: string;

    constructor(options: { id: string }) {
      this.id = options.id;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this as any).generate = mocks.generate;
    }
  },
}));

import { runMastraCanonicalChat } from '../src/mastra-v2/agents/canonical';

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

function message(text: string) {
  return {
    id: 'message-1',
    role: 'user' as const,
    parts: [{ type: 'text' as const, text }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prepareFails = false;
  mocks.resolveChatModel.mockReturnValue({
    model: {},
    modelId: 'google/gemini-2.5-flash',
    providerId: 'google',
    bareModelId: 'gemini-2.5-flash',
  });
  mocks.resolveMastraExecutionModel.mockReturnValue({
    model: {},
    modelId: 'google/gemini-2.5-flash',
    providerId: 'google',
    bareModelId: 'gemini-2.5-flash',
  });
  mocks.prepareKestrelMemory.mockImplementation(async () => {
    if (mocks.prepareFails) {
      throw new Error('connection lost');
    }
    return {
      callOptions: { thread: 'thread-1', resource: 'user-1', options: {} },
      memoryDegraded: false,
      backfillAttempted: false,
    };
  });
  mocks.generate.mockResolvedValue({
    text: 'Here is the answer.',
    usage: { inputTokens: 10, outputTokens: 5 },
    steps: [{}],
    response: { messages: [] },
  });
});

describe('canonical chat memory fallback (§1.5)', () => {
  it('still answers with memoryMode degraded when native memory prep throws', async () => {
    mocks.prepareFails = true;
    const result = await runMastraCanonicalChat({
      userId: 'user-1',
      threadId: 'thread-1',
      userMessage: message('explain RSI divergence'),
      history: [],
      settings,
      env,
    });

    expect(result.text).toBe('Here is the answer.');
    expect(result.memoryMode).toBe('degraded');
    // The turn completed — no naked throw, no 502 path.
    expect(mocks.generate).toHaveBeenCalled();
  });

  it('reports native memory when preparation succeeds', async () => {
    const result = await runMastraCanonicalChat({
      userId: 'user-1',
      threadId: 'thread-1',
      userMessage: message('explain RSI divergence'),
      history: [],
      settings,
      env,
    });

    expect(result.memoryMode).toBe('native');
    expect(result.text).toBe('Here is the answer.');
  });

  it('extracts structured toolParts from response messages and self-corrects ungrounded numbers once (Q10)', async () => {
    mocks.generate
      .mockResolvedValueOnce({
        text: 'Gold is trading at 9999.5 today.',
        usage: { inputTokens: 10, outputTokens: 5 },
        steps: [{}],
        response: {
          messages: [
            {
              role: 'assistant',
              content: [
                {
                  type: 'tool-call',
                  toolCallId: 'call-price-1',
                  toolName: 'get_price',
                  args: { symbol: 'XAUUSD' },
                },
              ],
            },
            {
              role: 'tool',
              content: [
                {
                  type: 'tool-result',
                  toolCallId: 'call-price-1',
                  toolName: 'get_price',
                  result: { symbol: 'XAUUSD', price: 2650.4 },
                },
              ],
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        text: 'Gold is trading at 2650.4 today.',
        usage: { inputTokens: 12, outputTokens: 6 },
        steps: [{}],
        response: { messages: [] },
      });

    const result = await runMastraCanonicalChat({
      userId: 'user-1',
      threadId: 'thread-1',
      userMessage: message('what is the price of XAUUSD?'),
      history: [],
      settings,
      env,
      routingDecision: { domain: 'technical', planRequired: true, rationale: 'test' },
    });

    expect(mocks.generate).toHaveBeenCalledTimes(2);
    expect(result.repaired).toBe(true);
    expect(result.text).toBe('Gold is trading at 2650.4 today.');
    expect(result.toolParts).toEqual([
      {
        type: 'tool-get_price',
        toolCallId: 'call-price-1',
        toolName: 'get_price',
        state: 'output-available',
        input: { symbol: 'XAUUSD' },
        output: { symbol: 'XAUUSD', price: 2650.4 },
      },
    ]);
  });
});
