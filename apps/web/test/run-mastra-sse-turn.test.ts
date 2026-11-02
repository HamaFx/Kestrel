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

// Phase 4 Task 3 — the single Mastra SSE turn lifecycle shared by canonical
// chat, custom agents, and the XAUUSD conversation stream.

// @vitest-environment node

import type { ChatStreamEvent } from '@kestrel/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  runMastraSseTurn,
  type MastraSseStream,
} from '@/lib/services/mastra/stream/run-mastra-sse-turn';

const mocks = vi.hoisted(() => {
  const ledgerState = { total: 0.1 };
  const ledger = {
    record: vi.fn(() => true),
    recordCost: vi.fn(() => true),
    recordUsage: vi.fn(() => true),
    snapshot: () => ({ entries: [], totalCostUsd: ledgerState.total }),
    total: () => ledgerState.total,
  };
  return {
    ledger,
    ledgerState,
    appendUserMessage: vi.fn(),
    appendAssistantMessage: vi.fn(),
    createGenerationLedger: vi.fn(() => ledger),
    reserveTurnBudget: vi.fn(async () => ({ budgetId: 'budget-1' })),
    getUserWithSettings: vi.fn(),
    getServerEnv: vi.fn(),
    maybeGenerateThreadTitle: vi.fn(),
    finalizer: {
      complete: vi.fn(async () => undefined),
      fail: vi.fn(async () => undefined),
      abort: vi.fn(async () => undefined),
    },
    createMastraStreamFinalizer: vi.fn(),
  };
});

vi.mock('@kestrel/ai', () => ({
  DEFAULT_MAX_DAILY_USD: 5,
  appendUserMessage: mocks.appendUserMessage,
  appendAssistantMessage: mocks.appendAssistantMessage,
  createGenerationLedger: mocks.createGenerationLedger,
  reserveTurnBudget: mocks.reserveTurnBudget,
}));

vi.mock('@kestrel/db', () => ({
  getUserWithSettings: mocks.getUserWithSettings,
}));

vi.mock('@/lib/env', () => ({
  getServerEnv: mocks.getServerEnv,
}));

vi.mock('@/lib/services/mastra/chat/mastra-thread-title', () => ({
  maybeGenerateThreadTitle: mocks.maybeGenerateThreadTitle,
}));

// The finalizer owns budget settlement; the shared turn only drives it, so a
// recording stub keeps these tests independent of the ledger implementation.
vi.mock('@/lib/services/mastra/stream/mastra-stream-finalizer', () => ({
  createMastraStreamFinalizer: mocks.createMastraStreamFinalizer,
}));

interface TestCompletion {
  text: string;
  toolParts?: Array<{
    toolCallId: string;
    toolName: string;
    state: string;
    input?: unknown;
    output?: unknown;
    errorText?: string;
  }>;
}

function parseEvents(body: string): Array<Record<string, unknown>> {
  return body
    .split('\n\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice('data: '.length)) as Record<string, unknown>);
}

function eventSequence(body: string): string[] {
  return parseEvents(body).map((event) =>
    event['type'] === 'tool-input-available' && event['toolCallId'] === 'late-1'
      ? 'tool-input-available:late'
      : event['type'] === 'tool-output-available' && event['toolCallId'] === 'late-1'
        ? 'tool-output-available:late'
        : String(event['type']),
  );
}

const baseInput = {
  userId: 'user-1',
  threadId: 'thread-1',
  userMessage: {
    id: 'message-1',
    role: 'user' as const,
    parts: [{ type: 'text' as const, text: 'hi' }],
  },
  idempotencyPrefix: 'mastra-test',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ledgerState.total = 0.1;
  mocks.getUserWithSettings.mockResolvedValue({ settings: { maxDailyUsd: 5 } });
  mocks.getServerEnv.mockReturnValue({});
  mocks.maybeGenerateThreadTitle.mockImplementation(async () => {
    mocks.ledgerState.total += 0.05;
  });
  mocks.createMastraStreamFinalizer.mockReturnValue(mocks.finalizer);
});

describe('runMastraSseTurn', () => {
  it('interleaves live tool events with text and settles the budget after the title call', async () => {
    let emit: ((event: ChatStreamEvent, options?: { markEmitted?: boolean }) => void) | null = null;
    const stream: MastraSseStream<TestCompletion> = {
      text: (async function* () {
        emit?.({
          type: 'tool-input-available',
          toolCallId: 'live-1',
          toolName: 'get_price',
          input: {},
        });
        yield 'Hello';
        emit?.({ type: 'tool-output-available', toolCallId: 'live-1', output: { ok: true } });
        yield ' world';
      })(),
      completion: Promise.resolve({
        text: 'Hello world',
        toolParts: [
          {
            toolCallId: 'live-1',
            toolName: 'get_price',
            state: 'output-available',
            input: {},
            output: { ok: true },
          },
          {
            toolCallId: 'late-1',
            toolName: 'get_candles',
            state: 'output-available',
            input: { symbol: 'XAUUSD' },
            output: { candles: [] },
          },
        ],
      }),
    };

    const response = await runMastraSseTurn({
      ...baseInput,
      openStream: async (context) => {
        emit = context.emitToolEvent;
        return stream;
      },
      title: ({ completed }) => ({ firstUser: 'hi', firstAssistant: completed.text }),
      finalize: async ({ messageId, postTextEvents, observedCost, completed }) => {
        postTextEvents.push({
          type: 'data-multi-agent-meta',
          id: messageId,
          data: { observedCost },
        });
        return {
          id: messageId,
          role: 'assistant',
          parts: [{ type: 'text', text: completed.text }],
        };
      },
    });

    const body = await response.text();

    expect(eventSequence(body)).toEqual([
      'text-start',
      'tool-input-available',
      'text-delta',
      'tool-output-available',
      'text-delta',
      'tool-input-available:late',
      'tool-output-available:late',
      'data-multi-agent-meta',
      'text-end',
      'turn-complete',
    ]);
    expect(mocks.maybeGenerateThreadTitle).toHaveBeenCalledWith(
      expect.objectContaining({ firstUser: 'hi', firstAssistant: 'Hello world' }),
    );
    // The title call lands in the ledger before the finalizer observes the cost.
    expect(mocks.maybeGenerateThreadTitle.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.finalizer.complete.mock.invocationCallOrder[0]!,
    );
    expect(mocks.finalizer.complete.mock.calls[0]?.[0]).toBeCloseTo(0.15);
    expect(mocks.appendUserMessage).toHaveBeenCalledWith(
      baseInput.userId,
      baseInput.threadId,
      baseInput.userMessage,
    );
    expect(mocks.appendAssistantMessage).toHaveBeenCalledWith(
      baseInput.userId,
      baseInput.threadId,
      expect.objectContaining({ role: 'assistant' }),
      { idempotencyKey: 'mastra-test:thread-1:message-1:assistant' },
    );
  });

  it('keeps completion tool parts eligible when a live event does not mark the call emitted', async () => {
    let emit: ((event: ChatStreamEvent, options?: { markEmitted?: boolean }) => void) | null = null;
    const stream: MastraSseStream<TestCompletion> = {
      text: (async function* () {
        emit?.(
          { type: 'tool-input-available', toolCallId: 'live-1', toolName: 'get_price', input: {} },
          { markEmitted: false },
        );
        yield 'text';
      })(),
      completion: Promise.resolve({
        text: 'text',
        toolParts: [
          {
            toolCallId: 'live-1',
            toolName: 'get_price',
            state: 'output-available',
            input: { late: true },
            output: { ok: true },
          },
        ],
      }),
    };

    const response = await runMastraSseTurn({
      ...baseInput,
      openStream: async (context) => {
        emit = context.emitToolEvent;
        return stream;
      },
      finalize: async ({ messageId, completed }) => ({
        id: messageId,
        role: 'assistant',
        parts: [{ type: 'text', text: completed.text }],
      }),
    });

    const body = await response.text();

    expect(eventSequence(body)).toEqual([
      'text-start',
      'tool-input-available',
      'text-delta',
      'tool-input-available',
      'tool-output-available',
      'text-end',
      'turn-complete',
    ]);
    // The completion part re-emitted the full input, not the live stub.
    const reEmitted = parseEvents(body).find(
      (event) =>
        event['type'] === 'tool-input-available' &&
        JSON.stringify(event['input']) === JSON.stringify({ late: true }),
    );
    expect(reEmitted).toBeDefined();
  });

  it('aborts the budget when the client disconnects mid-stream', async () => {
    const controller = new AbortController();
    const stream: MastraSseStream<TestCompletion> = {
      text: (async function* () {
        yield 'one';
        controller.abort();
        yield 'two';
      })(),
      completion: new Promise(() => undefined),
    };

    const response = await runMastraSseTurn({
      ...baseInput,
      signal: controller.signal,
      openStream: async () => stream,
      finalize: async ({ messageId }) => ({
        id: messageId,
        role: 'assistant',
        parts: [{ type: 'text', text: 'never' }],
      }),
    });

    const body = await response.text();

    expect(body).toContain('"status":"interrupted"');
    expect(mocks.finalizer.abort).toHaveBeenCalledTimes(1);
    expect(mocks.finalizer.fail).not.toHaveBeenCalled();
    expect(mocks.appendAssistantMessage).not.toHaveBeenCalled();
    expect(mocks.createMastraStreamFinalizer).toHaveBeenCalledWith(
      expect.objectContaining({ onInterrupted: expect.any(Function) }),
    );
  });

  it('fails the budget and emits an error event when the completion rejects', async () => {
    const stream: MastraSseStream<TestCompletion> = {
      text: (async function* () {
        yield 'partial';
      })(),
      completion: Promise.reject(new Error('provider down')),
    };
    void stream.completion.catch(() => undefined);

    const response = await runMastraSseTurn({
      ...baseInput,
      openStream: async () => stream,
      finalize: async ({ messageId }) => ({
        id: messageId,
        role: 'assistant',
        parts: [{ type: 'text', text: 'never' }],
      }),
    });

    const body = await response.text();

    expect(body).toContain('"type":"error"');
    expect(body).toContain('"status":"failed"');
    expect(mocks.finalizer.fail).toHaveBeenCalledTimes(1);
    expect(mocks.finalizer.complete).not.toHaveBeenCalled();
    expect(mocks.appendAssistantMessage).not.toHaveBeenCalled();
  });

  it('lets a service recover a completion rejection in-band', async () => {
    const stream: MastraSseStream<TestCompletion> = {
      text: (async function* () {
        yield 'draft';
      })(),
      completion: Promise.reject(new Error('evidence blocked')),
    };
    void stream.completion.catch(() => undefined);

    const response = await runMastraSseTurn({
      ...baseInput,
      openStream: async () => stream,
      finalize: async ({ messageId }) => ({
        id: messageId,
        role: 'assistant',
        parts: [{ type: 'text', text: 'never' }],
      }),
      recoverCompletion: async ({ error, messageId, postTextEvents }) => {
        postTextEvents.push({
          type: 'data-evidence-blocked',
          id: messageId,
          data: { message: 'blocked' },
        });
        return {
          assistantMessage: {
            id: messageId,
            role: 'assistant',
            parts: [{ type: 'text', text: 'Evidence blocked.' }],
          },
        };
      },
    });

    const body = await response.text();

    expect(body).toContain('"type":"data-evidence-blocked"');
    expect(body).not.toContain('"type":"error"');
    expect(body).toContain('"status":"persisted"');
    expect(mocks.finalizer.complete).toHaveBeenCalledWith(0.1);
    expect(mocks.maybeGenerateThreadTitle).not.toHaveBeenCalled();
    expect(mocks.appendAssistantMessage).toHaveBeenCalledWith(
      baseInput.userId,
      baseInput.threadId,
      expect.objectContaining({ role: 'assistant' }),
      { idempotencyKey: 'mastra-test:thread-1:message-1:assistant' },
    );
  });
});
