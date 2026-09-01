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

// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { mastraStreamResponse } from '@/lib/services/mastra-stream-response';

describe('mastraStreamResponse onAbort', () => {
  it('calls onAbort when the stream is aborted before completion', async () => {
    const onAbort = vi.fn();
    const controller = new AbortController();

    // An async iterable that yields one chunk, then waits for abort.
    async function* text(): AsyncIterable<string> {
      yield 'partial';
      // Wait for the abort signal, then throw.
      await new Promise<void>((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(controller.signal.reason ?? new DOMException('Aborted', 'AbortError'));
        });
      });
    }

    const response = mastraStreamResponse(text(), 'msg-1', {
      signal: controller.signal,
      onAbort,
      onComplete: () => 'interrupted',
    });

    // Abort after a short delay so the first chunk can be yielded.
    setTimeout(() => controller.abort(), 20);

    // Drain the stream.
    const reader = response.body!.getReader();
    try {
      for (;;) {
        const { done } = await reader.read();
        if (done) break;
      }
    } catch {
      // Errors are expected on abort.
    }

    // Give the async onAbort callback time to fire.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onAbort).toHaveBeenCalledTimes(1);
  });

  it('calls onAbort when the consumer cancels the response', async () => {
    const onAbort = vi.fn().mockResolvedValue(undefined);
    let returned = false;

    const text: AsyncIterable<string> = {
      [Symbol.asyncIterator]() {
        return {
          next: async () => ({ value: 'partial', done: false }),
          return: async () => {
            returned = true;
            return { value: undefined, done: true };
          },
        };
      },
    };

    const response = mastraStreamResponse(text, 'msg-cancel', { onAbort });
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel('client disconnected');

    expect(returned).toBe(true);
    expect(onAbort).toHaveBeenCalledTimes(1);
  });

  it('emits the durable terminal status before ending normally', async () => {
    const onComplete = vi.fn().mockReturnValue('persisted');

    async function* text(): AsyncIterable<string> {
      yield 'hello';
      yield ' world';
    }

    const response = mastraStreamResponse(text(), 'msg-2', {
      onComplete,
    });

    const reader = response.body!.getReader();
    let body = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      body += new TextDecoder().decode(value);
    }

    expect(body).toContain('"type":"turn-complete"');
    expect(body).toContain('"status":"persisted"');
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('does not invoke completion twice when abort races with persistence failure', async () => {
    const onComplete = vi.fn().mockReturnValue('persistence-failed');
    const onAbort = vi.fn().mockResolvedValue(undefined);
    async function* text(): AsyncIterable<string> {
      yield 'hello';
      throw new Error('persistence unavailable');
    }
    const response = mastraStreamResponse(text(), 'msg-race', {
      onComplete,
      onAbort,
    });
    const reader = response.body!.getReader();
    for (;;) {
      const { done } = await reader.read();
      if (done) break;
    }
    expect(onComplete).toHaveBeenCalledOnce();
    expect(onAbort).toHaveBeenCalledOnce();
  });

  it('emits persistence-failed when completion reports a persistence failure', async () => {
    async function* text(): AsyncIterable<string> {
      yield 'hello';
    }
    const response = mastraStreamResponse(text(), 'msg-failed', {
      onComplete: () => 'persistence-failed',
    });
    const reader = response.body!.getReader();
    let body = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      body += new TextDecoder().decode(value);
    }
    expect(body).toContain('"status":"persistence-failed"');
  });
});
