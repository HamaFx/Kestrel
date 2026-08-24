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

// SPDX-License-Identifier: Apache-2.0

import { ChatStreamEventSchema } from '@kestrel/shared';

export interface MastraStreamResponseMeta {
  readonly id: string;
  readonly data: Record<string, unknown>;
}

export interface MastraStreamResponseOptions {
  readonly meta?: MastraStreamResponseMeta;
  readonly signal?: AbortSignal;
  /**
   * Called when the stream is aborted before completion (client disconnect
   * or upstream error). This is the hook for the service layer to persist
   * an "interrupted" assistant marker so the orphaned user message has
   * context when the user retries. The callback must not throw — failures
   * are swallowed so the stream can close cleanly.
   */
  readonly onAbort?: () => void | Promise<void>;
}

function encode(event: unknown): Uint8Array {
  return new TextEncoder().encode(
    `data: ${JSON.stringify(ChatStreamEventSchema.parse(event))}\n\n`,
  );
}

/**
 * Adapt an async text iterable into the chat SSE contract. The iterable is
 * consumed lazily, so the first provider chunk can reach the browser without
 * waiting for the full answer.
 */
export function mastraStreamResponse(
  text: AsyncIterable<string>,
  messageId: string,
  options: MastraStreamResponseOptions = {},
): Response {
  // Store the upstream iterator so the stream's cancel() handler can
  // close it explicitly. Without this, a client disconnect can leave the
  // provider streaming indefinitely.
  let upstreamIterator: AsyncIterator<string> | null = null;
  let cancelled = false;
  let abortNotified = false;

  const notifyAbort = async (): Promise<void> => {
    if (abortNotified || !options.onAbort) return;
    abortNotified = true;
    try {
      await options.onAbort();
    } catch {
      // Abort cleanup is best-effort and must not mask the stream shutdown.
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let started = false;
      let ended = false;
      upstreamIterator = text[Symbol.asyncIterator]();
      try {
        if (options.signal?.aborted)
          throw options.signal.reason ?? new DOMException('Aborted', 'AbortError');
        controller.enqueue(encode({ type: 'text-start', id: messageId }));
        started = true;
        for (
          let next = await upstreamIterator.next();
          !next.done;
          next = await upstreamIterator.next()
        ) {
          if (options.signal?.aborted)
            throw options.signal.reason ?? new DOMException('Aborted', 'AbortError');
          if (next.value)
            controller.enqueue(encode({ type: 'text-delta', id: messageId, delta: next.value }));
        }
        if (options.meta) {
          controller.enqueue(
            encode({ type: 'data-multi-agent-meta', id: options.meta.id, data: options.meta.data }),
          );
        }
        controller.enqueue(encode({ type: 'text-end', id: messageId }));
        ended = true;
      } catch (error) {
        if (!cancelled && !options.signal?.aborted) {
          controller.enqueue(
            encode({
              type: 'error',
              errorText: error instanceof Error ? error.message : 'Mastra stream failed.',
            }),
          );
        }
        // When the stream is aborted before completion, fire the onAbort
        // callback so the service layer can persist an interrupted marker.
        if (started && !ended) await notifyAbort();
      } finally {
        if (started && !ended && !cancelled) {
          controller.enqueue(encode({ type: 'text-end', id: messageId }));
        }
        upstreamIterator = null;
        if (!cancelled) controller.close();
      }
    },
    async cancel() {
      cancelled = true;
      // Close the upstream async iterator so the provider stops streaming
      // when the client disconnects. The iterator's return() method signals
      // the producer to release resources.
      try {
        await upstreamIterator?.return?.();
      } finally {
        upstreamIterator = null;
      }
      await notifyAbort();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
