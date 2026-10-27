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

import { replayPersistenceFailures } from '../src/persistence/recovery';
import { markFailed } from '../src/persistence/recovery/claim';
import type * as TelemetryPersistenceModule from '../src/persistence/telemetry-persistence';

const {
  mockDbExecute,
  mockTxExecute,
  mockRecordTelemetry,
  mockRecordToolTelemetry,
  mockAppendUserMessage,
  mockAppendAssistantMessage,
  mockSaveAgentOpinions,
  mockPersistTraceStrict,
} = vi.hoisted(() => ({
  mockDbExecute: vi.fn(),
  mockTxExecute: vi.fn(),
  mockRecordTelemetry: vi.fn(),
  mockRecordToolTelemetry: vi.fn(),
  mockAppendUserMessage: vi.fn(),
  mockAppendAssistantMessage: vi.fn(),
  mockSaveAgentOpinions: vi.fn(),
  mockPersistTraceStrict: vi.fn(),
}));

/** Collect values bound into a drizzle raw-SQL object (chunks are raw values). */
function collectParamValues(sqlArg: unknown): unknown[] {
  const chunks = (sqlArg as { queryChunks?: unknown[] } | null | undefined)?.queryChunks ?? [];
  const params: unknown[] = [];
  for (const chunk of chunks) {
    if (chunk instanceof Date || ['string', 'number', 'boolean', 'bigint'].includes(typeof chunk)) {
      params.push(chunk);
    } else if (
      chunk !== null &&
      typeof chunk === 'object' &&
      'value' in chunk &&
      !Array.isArray((chunk as { value: unknown }).value)
    ) {
      // drizzle `Param` wrapper (defensive: some versions wrap raw values).
      params.push((chunk as { value: unknown }).value);
    }
  }
  return params;
}

const mockDb = {
  execute: mockDbExecute,
  transaction: (callback: (tx: { execute: typeof mockTxExecute }) => Promise<unknown>) =>
    callback({ execute: mockTxExecute }),
};

vi.mock('../src/runtime/db', () => ({ getDb: () => mockDb }));
vi.mock('../src/persistence/telemetry-persistence', async (importOriginal) => {
  // Audit v2 §4.5 — persistence-recovery builds its replay kind enum from
  // the real TELEMETRY_KINDS, so the mock must preserve the module's
  // runtime constants and only stub the two DB writers.
  const actual = await importOriginal<typeof TelemetryPersistenceModule>();
  return {
    ...actual,
    recordTelemetry: mockRecordTelemetry,
    recordToolTelemetry: mockRecordToolTelemetry,
  };
});
vi.mock('../src/persistence/message-persistence', () => ({
  appendUserMessage: mockAppendUserMessage,
  appendAssistantMessage: mockAppendAssistantMessage,
}));
vi.mock('../src/multi-agent/persistence', () => ({
  saveAgentOpinions: mockSaveAgentOpinions,
}));
vi.mock('../src/diagnostics/trace-persistence', () => ({
  persistTraceStrict: mockPersistTraceStrict,
}));

describe('persistence outbox replay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecordTelemetry.mockResolvedValue(undefined);
    mockRecordToolTelemetry.mockResolvedValue(true);
    mockAppendUserMessage.mockResolvedValue(undefined);
    mockAppendAssistantMessage.mockResolvedValue({ messageId: 'db-message-1' });
    mockSaveAgentOpinions.mockResolvedValue(undefined);
    mockPersistTraceStrict.mockResolvedValue(undefined);
    mockDbExecute.mockResolvedValue({ rows: [] });
  });

  it('claims, dispatches, and completes a telemetry replay', async () => {
    mockTxExecute
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'outbox-1',
            operation: 'telemetry.turn',
            payload: {
              userId: 'user-1',
              threadId: 'thread-1',
              messageId: null,
              idempotencyKey: 'telemetry.turn:1',
              model: 'test/model',
              inputTokens: 3,
              outputTokens: 2,
              toolCalls: 0,
              ms: 10,
              traceId: null,
              runId: null,
              jobId: null,
              kind: null,
            },
            attempt_count: 0,
            max_attempts: 8,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'outbox-1' }] });

    const result = await replayPersistenceFailures(1);

    expect(mockRecordTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        idempotencyKey: 'telemetry.turn:1',
      }),
    );
    expect(mockDbExecute).toHaveBeenCalled();
    expect(result).toEqual({ claimed: 1, completed: 1, failed: 0, dead: 0 });
  });

  it('binds ISO date strings — never Date objects — into raw outbox SQL', async () => {
    mockTxExecute
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'outbox-iso',
            operation: 'telemetry.turn',
            payload: {
              userId: 'user-1',
              threadId: 'thread-1',
              messageId: null,
              idempotencyKey: 'telemetry.turn:iso',
              model: 'test/model',
              inputTokens: 3,
              outputTokens: 2,
              toolCalls: 0,
              ms: 10,
              traceId: null,
              runId: null,
              jobId: null,
              kind: null,
            },
            attempt_count: 0,
            max_attempts: 8,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'outbox-iso' }] });

    await replayPersistenceFailures(1);

    // Regression (2026-10-27): drizzle's raw `sql` templates do not map
    // parameters and postgres-js hashes them; a Date instance throws
    // ERR_INVALID_ARG_TYPE before reaching Postgres, which silently broke
    // every outbox replay. The claim transaction's SELECT + UPDATE and the
    // markFailed UPDATE must all carry ISO strings, never Date objects.
    const claimCallValues = mockTxExecute.mock.calls.map((call) => collectParamValues(call[0]));
    expect(claimCallValues.some((values) => values.some((v) => v instanceof Date))).toBe(false);
    expect(
      claimCallValues.some((values) =>
        values.some(
          (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value),
        ),
      ),
    ).toBe(true);

    await markFailed(
      {
        id: 'outbox-iso',
        operation: 'telemetry.turn',
        payload: {},
        attemptCount: 1,
        maxAttempts: 8,
        lockToken: 'test-lock',
      },
      new Error('boom'),
    );
    const failValues = collectParamValues(mockDbExecute.mock.calls.at(-1)?.[0]);
    expect(failValues.some((value) => value instanceof Date)).toBe(false);
    expect(
      failValues.some(
        (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value),
      ),
    ).toBe(true);
  });

  it('replays messages using their stable idempotency key', async () => {
    mockTxExecute
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'outbox-message',
            operation: 'message.assistant',
            payload: {
              userId: 'user-1',
              threadId: 'thread-1',
              idempotencyKey: 'ui:assistant-1',
              message: {
                id: 'assistant-1',
                role: 'assistant',
                parts: [{ type: 'text', text: 'replayed' }],
              },
            },
            attempt_count: 0,
            max_attempts: 8,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'outbox-message' }] });

    await replayPersistenceFailures(1);

    expect(mockAppendAssistantMessage).toHaveBeenCalledWith(
      'user-1',
      'thread-1',
      expect.objectContaining({ id: 'assistant-1', role: 'assistant' }),
      { idempotencyKey: 'ui:assistant-1' },
    );
  });

  it('reclaims a worker-crashed processing record after its lease expires', async () => {
    mockTxExecute
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'outbox-stale',
            operation: 'telemetry.turn',
            payload: {
              userId: 'user-1',
              threadId: 'thread-1',
              messageId: null,
              idempotencyKey: 'telemetry.stale:1',
              model: 'test/model',
              inputTokens: 1,
              outputTokens: 1,
              toolCalls: 0,
              ms: 1,
              traceId: null,
              runId: null,
              jobId: null,
              kind: null,
            },
            attempt_count: 1,
            max_attempts: 8,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'outbox-stale' }] });

    const result = await replayPersistenceFailures(1);

    expect(mockRecordTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'telemetry.stale:1',
      }),
    );
    expect(result).toEqual({ claimed: 1, completed: 1, failed: 0, dead: 0 });
  });

  it('marks a failed replay for exponential retry', async () => {
    mockRecordTelemetry.mockRejectedValueOnce(new Error('database unavailable'));
    mockTxExecute
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'outbox-failed',
            operation: 'telemetry.turn',
            payload: {
              userId: 'user-1',
              threadId: 'thread-1',
              messageId: null,
              traceId: null,
              runId: null,
              jobId: null,
              kind: null,
              idempotencyKey: 'telemetry.retry:1',
              model: 'test/model',
              inputTokens: 1,
              outputTokens: 1,
              toolCalls: 0,
              ms: 1,
            },
            attempt_count: 0,
            max_attempts: 8,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'outbox-failed' }] });

    const result = await replayPersistenceFailures(1);

    expect(result).toEqual({ claimed: 1, completed: 0, failed: 1, dead: 0 });
    expect(mockDbExecute).toHaveBeenCalled();
  });

  it('stops processing a record after max attempts and marks it dead', async () => {
    mockRecordTelemetry.mockRejectedValueOnce(new Error('permanent failure'));
    mockTxExecute
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'outbox-dead',
            operation: 'telemetry.turn',
            payload: { userId: 'user-1', threadId: 'thread-1', messageId: null },
            attempt_count: 7,
            max_attempts: 8,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'outbox-dead' }] });

    const result = await replayPersistenceFailures(1);

    expect(result).toEqual({ claimed: 1, completed: 0, failed: 0, dead: 1 });
  });

  it('does nothing when no due outbox row can be claimed', async () => {
    mockTxExecute.mockResolvedValueOnce({ rows: [] });

    await expect(replayPersistenceFailures(10)).resolves.toEqual({
      claimed: 0,
      completed: 0,
      failed: 0,
      dead: 0,
    });
    expect(mockDbExecute).not.toHaveBeenCalled();
  });

  it('stops claiming outbox rows immediately when signal is aborted', async () => {
    const ac = new AbortController();
    ac.abort();

    const result = await replayPersistenceFailures(10, ac.signal);

    expect(result).toEqual({
      claimed: 0,
      completed: 0,
      failed: 0,
      dead: 0,
    });
    expect(mockTxExecute).not.toHaveBeenCalled();
  });
});
