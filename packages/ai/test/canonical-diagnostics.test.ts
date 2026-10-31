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

// Phase 1 (observability roadmap) — canonical chat coverage in the diagnostic
// scope. Every buffered and streaming turn must bind `traceId`/`runId` through
// `withDiagnostics`, and a stream persists its `diagnostic_traces` row only in
// its terminal finalizer (never when the HTTP response handle returns).

import { container } from '@kestrel/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDiagnosticContext } from '../src/diagnostics';
import {
  runMastraCanonicalChat,
  runMastraCanonicalChatStream,
} from '../src/mastra-v2/agents/canonical';
import { DB } from '../src/runtime/tokens';

container.register(DB, () => ({ select: () => undefined }) as never);

const mocks = vi.hoisted(() => ({
  persistTrace: vi.fn().mockResolvedValue(undefined),
  beginMastraRun: vi.fn(),
  finishMastraRun: vi.fn().mockResolvedValue(undefined),
  generate: vi.fn(),
  stream: vi.fn(),
  observedRunId: null as string | null,
  observedTraceId: null as string | null,
}));

vi.mock('../src/diagnostics/trace-persistence', () => ({
  persistTrace: mocks.persistTrace,
}));

vi.mock('../src/mastra-v2/agents/canonical/setup', () => ({
  setupCanonicalChat: async (args: { runId?: string; userId: string; threadId: string }) => ({
    runId: args.runId ?? 'unexpected-generated-run-id',
    agent: { generate: mocks.generate, stream: mocks.stream },
    routing: { domain: 'generic', planRequired: false, rationale: 'diagnostic test' },
    resolution: {
      model: {},
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
      latestUserMessageText: 'diagnostic test',
      env: {},
      signal: null,
      budget: { spent: 0, max: 5 },
      userSettings: {},
      toolTelemetryBuffer: [],
    },
    messages: [],
    scorers: { entries: {} },
    memoryDegraded: false,
    memoryBackfill: false,
  }),
}));

vi.mock('../src/mastra-v2/shared/telemetry', () => ({
  beginMastraRun: mocks.beginMastraRun,
  createMastraRunFinalizer: () => mocks.finishMastraRun,
  finishMastraRun: mocks.finishMastraRun,
  getMastraGenerationStats: () => ({ inputTokens: 10, outputTokens: 5, toolCalls: 0, steps: 1 }),
  mastraOutcomeForError: (error: unknown, signal?: AbortSignal) =>
    signal?.aborted || (error instanceof Error && error.name === 'AbortError')
      ? 'cancelled'
      : 'failed',
}));

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

function fullOutput(text = 'Here is the answer.') {
  return {
    text,
    usage: { inputTokens: 10, outputTokens: 5 },
    steps: [{}],
    response: { messages: [] },
  };
}

interface PersistedDiagnosticTrace {
  traceId: string;
  status: string;
  trace: Record<string, unknown>;
}

describe('Diagnostic trace coverage across canonical chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.observedRunId = null;
    mocks.observedTraceId = null;
    // Capture the ambient diagnostic context at the exact point the run
    // finalizes — this is what the log/metric correlation depends on.
    mocks.finishMastraRun.mockImplementation(async () => {
      const ctx = getDiagnosticContext();
      mocks.observedRunId = ctx?.runId ?? null;
      mocks.observedTraceId = ctx?.traceId ?? null;
    });
  });

  it('has no ambient diagnostic context outside a run', () => {
    expect(getDiagnosticContext()).toBeNull();
  });

  it('binds traceId/runId and persists a completed trace for runMastraCanonicalChat', async () => {
    mocks.generate.mockResolvedValue(fullOutput());

    const result = await runMastraCanonicalChat({
      userId: 'user-1',
      threadId: 'thread-1',
      userMessage: message('explain RSI divergence'),
      history: [],
      settings,
      env,
      runId: 'run-diag-buffered',
    });

    expect(result.text).toBe('Here is the answer.');
    expect(mocks.observedRunId).toBe('run-diag-buffered');
    expect(mocks.observedTraceId).toBe('run-diag-buffered');
    expect(mocks.persistTrace).toHaveBeenCalledTimes(1);
    const persisted = mocks.persistTrace.mock.calls[0]![0] as PersistedDiagnosticTrace;
    expect(persisted.traceId).toBe('run-diag-buffered');
    expect(persisted.status).toBe('completed');
    expect(persisted.trace.runId).toBe('run-diag-buffered');
    expect(getDiagnosticContext()).toBeNull();
  });

  it('defers the stream trace until the stream finalizes and then persists it completed', async () => {
    const gate: { resolve: ((value: unknown) => void) | null } = { resolve: null };
    mocks.stream.mockResolvedValue({
      textStream: (async function* () {
        yield 'Here ';
        yield 'is the answer.';
      })(),
      getFullOutput: () =>
        new Promise((resolve) => {
          gate.resolve = resolve;
        }),
    });

    const stream = await runMastraCanonicalChatStream({
      userId: 'user-1',
      threadId: 'thread-1',
      userMessage: message('explain RSI divergence'),
      history: [],
      settings,
      env,
      runId: 'run-diag-stream',
    });

    // The HTTP response handle returned — no trace yet.
    expect(mocks.persistTrace).not.toHaveBeenCalled();

    const chunks: string[] = [];
    for await (const chunk of stream.text) chunks.push(chunk);
    gate.resolve?.(fullOutput());
    await stream.completion;

    expect(chunks.join('')).toBe('Here is the answer.');
    expect(mocks.observedRunId).toBe('run-diag-stream');
    expect(mocks.observedTraceId).toBe('run-diag-stream');
    expect(mocks.persistTrace).toHaveBeenCalledTimes(1);
    const persisted = mocks.persistTrace.mock.calls[0]![0] as PersistedDiagnosticTrace;
    expect(persisted.traceId).toBe('run-diag-stream');
    expect(persisted.status).toBe('completed');
    expect(persisted.trace.runId).toBe('run-diag-stream');
  });

  it('persists a failed stream trace when the text stream errors', async () => {
    mocks.stream.mockResolvedValue({
      textStream: (async function* () {
        yield 'partial';
        throw new Error('stream boom');
      })(),
      // Never resolves: the failure path must come from the text stream, not
      // from a completed generation.
      getFullOutput: () => new Promise(() => undefined),
    });

    const stream = await runMastraCanonicalChatStream({
      userId: 'user-1',
      threadId: 'thread-1',
      userMessage: message('explain RSI divergence'),
      history: [],
      settings,
      env,
      runId: 'run-diag-stream-failed',
    });

    await expect(
      (async () => {
        for await (const _chunk of stream.text) {
          // consume until the stream throws
        }
      })(),
    ).rejects.toThrow('stream boom');

    await vi.waitFor(() => expect(mocks.persistTrace).toHaveBeenCalledTimes(1));
    const persisted = mocks.persistTrace.mock.calls[0]![0] as PersistedDiagnosticTrace;
    expect(persisted.traceId).toBe('run-diag-stream-failed');
    expect(persisted.status).toBe('failed');
  });
});
