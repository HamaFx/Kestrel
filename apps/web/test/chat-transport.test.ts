// @vitest-environment node
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

import { afterEach, describe, expect, it, vi } from 'vitest';

import { chatErrorText, createKestrelChatTransport } from '@/lib/chat-transport';

function sseResponse(events: unknown[]): Response {
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream; charset=utf-8' },
  });
}

async function readChunks(
  stream: ReadableStream<Record<string, unknown>>,
): Promise<Array<Record<string, unknown>>> {
  const chunks: Array<Record<string, unknown>> = [];
  const reader = stream.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return chunks;
      if (value) chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
}

describe('createKestrelChatTransport', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('constructs a transport backed by the ai SDK DefaultChatTransport', () => {
    const transport = createKestrelChatTransport({ api: '/api/chat' });

    expect(transport).toBeDefined();
    // The transport should expose the AI SDK chat surface. If the ai SDK
    // ever removes or renames DefaultChatTransport, this test fails early
    // rather than at runtime in the browser.
    expect(typeof (transport as { sendMessages?: unknown }).sendMessages).toBe('function');
  });

  it('propagates custom headers through the transport options', () => {
    const transport = createKestrelChatTransport({
      api: '/api/chat',
      headers: { 'x-custom': 'value' },
    });

    expect(transport).toBeDefined();
  });

  it('closes legacy SSE text exactly once and keeps completed progress visible', async () => {
    const progress = vi.fn();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      sseResponse([
        { type: 'data-agent-progress', data: { agents: [], mode: 'quick' } },
        { type: 'text-start', id: 'server-message-id' },
        { type: 'text-delta', id: 'server-message-id', delta: 'hello' },
        { type: 'text-end', id: 'server-message-id' },
      ]),
    );

    const transport = createKestrelChatTransport({ api: '/api/chat', onAgentProgress: progress });
    const stream = await transport.sendMessages({
      chatId: 'thread-1',
      messages: [],
      abortSignal: new AbortController().signal,
    });

    const chunks = await readChunks(stream as ReadableStream<Record<string, unknown>>);
    const ends = chunks.filter((chunk) => chunk.type === 'text-end');
    expect(ends).toHaveLength(1);
    expect(ends[0]?.id).toBe('server-message-id');
    expect(progress).toHaveBeenLastCalledWith({ agents: [], mode: 'quick' });
    expect(fetchMock).toHaveBeenCalled();
  });

  it('forwards AI SDK v5 tool stream events and data-evidence-blocked events without dropping them', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      sseResponse([
        { type: 'text-start', id: 'msg-tool-1' },
        { type: 'tool-input-start', toolCallId: 'call-1', toolName: 'get_price' },
        {
          type: 'tool-input-available',
          toolCallId: 'call-1',
          toolName: 'get_price',
          input: { symbol: 'XAUUSD' },
        },
        {
          type: 'tool-output-available',
          toolCallId: 'call-1',
          output: { symbol: 'XAUUSD', price: 2650.4 },
        },
        { type: 'text-delta', id: 'msg-tool-1', delta: 'Gold is at 2650.4' },
        {
          type: 'data-evidence-blocked',
          id: 'msg-tool-1',
          data: { message: 'Verified replacement', repaired: true },
        },
        { type: 'text-end', id: 'msg-tool-1' },
      ]),
    );

    const transport = createKestrelChatTransport({ api: '/api/chat' });
    const stream = await transport.sendMessages({
      chatId: 'thread-1',
      messages: [],
      abortSignal: new AbortController().signal,
    });
    const chunks = await readChunks(stream as ReadableStream<Record<string, unknown>>);

    expect(chunks.some((c) => c.type === 'tool-input-available')).toBe(true);
    expect(chunks.some((c) => c.type === 'tool-output-available')).toBe(true);
    expect(chunks.some((c) => c.type === 'data-evidence-blocked')).toBe(true);
    expect(chunks.some((c) => c.type === 'error')).toBe(false);
  });

  it('polls a queued full-mode job and emits its final metadata', async () => {
    vi.useFakeTimers();
    const progress = vi.fn();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            type: 'analysis-queued',
            jobId: 'job-123',
            status: 'queued',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'complete',
            progress: [
              {
                type: 'data-agent-progress',
                data: { agents: [{ agentName: 'technical', status: 'done' }], mode: 'full' },
              },
            ],
            result: {
              finalText: 'full result',
              messageId: 'message-123',
              agentOpinions: [{ agentName: 'technical', bias: 'bullish' }],
              mode: 'full',
              totalCostUsd: 0.04,
              totalLatencyMs: 1234,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );

    const transport = createKestrelChatTransport({ api: '/api/chat', onAgentProgress: progress });
    const stream = await transport.sendMessages({
      chatId: 'thread-1',
      messages: [],
      abortSignal: new AbortController().signal,
    });
    const chunksPromise = readChunks(stream as ReadableStream<Record<string, unknown>>);
    await vi.advanceTimersByTimeAsync(2_000);
    const chunks = await chunksPromise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(progress).toHaveBeenCalledWith({
      agents: [{ agentName: 'technical', status: 'done' }],
      mode: 'full',
    });
    expect(chunks.some((chunk) => chunk.type === 'text-delta')).toBe(true);
    expect(chunks.some((chunk) => chunk.type === 'data-multi-agent-meta')).toBe(true);
  });

  it('preserves Mastra report metadata in the AI SDK data stream', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      sseResponse([
        { type: 'text-start', id: 'mastra-message' },
        { type: 'text-delta', id: 'mastra-message', delta: 'gold report' },
        { type: 'text-end', id: 'mastra-message' },
        {
          type: 'data-multi-agent-meta',
          id: 'mastra-message',
          transient: true,
          data: { agent: 'mastra-xauusd', report: { bias: 'neutral' } },
        },
      ]),
    );

    const transport = createKestrelChatTransport({ api: '/api/chat' });
    const stream = await transport.sendMessages({
      chatId: 'thread-1',
      messages: [],
      abortSignal: new AbortController().signal,
    });
    const chunks = await readChunks(stream as ReadableStream<Record<string, unknown>>);
    const meta = chunks.find((chunk) => chunk.type === 'data-multi-agent-meta');

    expect(meta).toMatchObject({
      data: { agent: 'mastra-xauusd', report: { bias: 'neutral' } },
    });
  });

  it('surfaces malformed SSE instead of presenting truncated text as complete', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        'data: {"type":"text-start","id":"server-message-id"}\n\ndata: {not-json}\n\n',
        { status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8' } },
      ),
    );

    const transport = createKestrelChatTransport({ api: '/api/chat' });
    const stream = await transport.sendMessages({
      chatId: 'thread-1',
      messages: [],
      abortSignal: new AbortController().signal,
    });
    const chunks = await readChunks(stream as ReadableStream<Record<string, unknown>>);

    expect(chunks.some((chunk) => chunk.type === 'error')).toBe(true);
  });

  it('creates a matching text start/end pair when SSE ends without a text-start', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      sseResponse([{ type: 'text-end', id: 'server-message-id' }]),
    );

    const transport = createKestrelChatTransport({ api: '/api/chat' });
    const stream = await transport.sendMessages({
      chatId: 'thread-1',
      messages: [],
      abortSignal: new AbortController().signal,
    });
    const chunks = await readChunks(stream as ReadableStream<Record<string, unknown>>);

    expect(chunks.map((chunk) => chunk.type)).toEqual(['text-start', 'text-end']);
    expect(chunks[0]?.id).toBe('server-message-id');
    expect(chunks[1]?.id).toBe('server-message-id');
  });

  it('keeps failed Full-mode progress and emits no partial text', async () => {
    vi.useFakeTimers();
    const progress = vi.fn();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            type: 'analysis-queued',
            jobId: 'job-strict',
            status: 'queued',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'failed',
            progress: [
              {
                type: 'data-agent-progress',
                data: {
                  mode: 'full',
                  status: 'failed',
                  error: 'Full analysis stopped. No partial answer was returned.',
                  agents: [
                    { agentName: 'technical', status: 'done' },
                    { agentName: 'sentiment', status: 'error', error: 'Required agent failed.' },
                    { agentName: 'decision', status: 'error', error: 'Full analysis stopped.' },
                  ],
                },
              },
            ],
            error: 'Full analysis could not be completed. No partial answer was returned.',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );

    const transport = createKestrelChatTransport({ api: '/api/chat', onAgentProgress: progress });
    const stream = await transport.sendMessages({
      chatId: 'thread-1',
      messages: [],
      abortSignal: new AbortController().signal,
    });
    const chunksPromise = readChunks(stream as ReadableStream<Record<string, unknown>>);
    await vi.advanceTimersByTimeAsync(2_000);
    const chunks = await chunksPromise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(chunks.some((chunk) => chunk.type === 'text-delta')).toBe(false);
    expect(chunks.some((chunk) => chunk.type === 'error')).toBe(true);
    expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'failed' }));
  });

  // — P1-14: the poll window must not hard-fail while the job is live ————

  it('keeps polling past the old 5-minute window while the job is still pending', async () => {
    vi.useFakeTimers();
    const abort = new AbortController();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ type: 'analysis-queued', jobId: 'job-slow', status: 'queued' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      // Every poll reports the job as still working. A fresh Response per
      // call — a Response body can only be consumed once.
      .mockImplementation(
        async () =>
          new Response(JSON.stringify({ status: 'running', progress: [] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      );

    const transport = createKestrelChatTransport({ api: '/api/chat' });
    const stream = await transport.sendMessages({
      chatId: 'thread-1',
      messages: [],
      abortSignal: abort.signal,
    });
    const chunksPromise = readChunks(stream as ReadableStream<Record<string, unknown>>);

    // Advance six minutes — one minute past the retired 5-minute window
    // (~150 two-second polls). Polling must still be alive and error-free.
    await vi.advanceTimersByTimeAsync(6 * 60_000);
    const pollsAfterSixMinutes = fetchMock.mock.calls.length - 1;
    expect(pollsAfterSixMinutes).toBeGreaterThan(150);

    abort.abort();
    await vi.advanceTimersByTimeAsync(2_000);
    const chunks = await chunksPromise;

    expect(chunks.some((chunk) => chunk.type === 'error')).toBe(false);
  });

  // — P1-15: the server's error envelope message must reach the UI ———————

  it('rewrites a non-OK JSON error envelope so the SDK surfaces error.error.message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: 'VALIDATION_ERROR', message: 'Please rephrase your request.' },
        }),
        { status: 422, headers: { 'content-type': 'application/json' } },
      ),
    );

    const transport = createKestrelChatTransport({ api: '/api/chat' });
    // The AI SDK throws `new Error(await response.text())` for non-OK
    // responses; the transport rewrites the envelope body to the server's
    // message so that error is what useChat shows.
    await expect(
      transport.sendMessages({
        chatId: 'thread-1',
        messages: [],
        abortSignal: new AbortController().signal,
      }),
    ).rejects.toThrow('Please rephrase your request.');
  });

  it('passes non-JSON error bodies through untouched', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Internal Server Error', {
        status: 500,
        headers: { 'content-type': 'text/plain' },
      }),
    );

    const transport = createKestrelChatTransport({ api: '/api/chat' });
    await expect(
      transport.sendMessages({
        chatId: 'thread-1',
        messages: [],
        abortSignal: new AbortController().signal,
      }),
    ).rejects.toThrow('Internal Server Error');
  });

  it('decodes raw envelope text that leaked into an error message (chatErrorText)', () => {
    expect(
      chatErrorText(new Error('{"error":{"code":"NOT_FOUND","message":"thread not found"}}')),
    ).toBe('thread not found');
    expect(chatErrorText(new Error('Background analysis stopped.'))).toBe(
      'Background analysis stopped.',
    );
    expect(chatErrorText('{"error":{"code":"X","message":"rate limited, slow down"}}')).toBe(
      'rate limited, slow down',
    );
    expect(chatErrorText(null)).toBe('Something went wrong.');
    // JSON that is not the error envelope is shown as-is.
    expect(chatErrorText(new Error('{"stats":{"wins":12}}'))).toBe('{"stats":{"wins":12}}');
  });
});
