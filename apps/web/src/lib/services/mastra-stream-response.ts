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

import 'server-only';

import { ChatStreamEventSchema } from '@kestrel/shared';

export interface MastraStreamResponseMeta {
  readonly id: string;
  readonly data: Record<string, unknown>;
}

export type MastraStreamTerminalStatus =
  'persisted' | 'persistence-failed' | 'interrupted' | 'failed';

export interface MastraStreamResponseOptions {
  readonly meta?: MastraStreamResponseMeta;
  readonly signal?: AbortSignal;
  readonly onAbort?: () => void | Promise<void>;
  /** Called exactly once after upstream consumption, before the stream closes. */
  readonly onComplete?: () => MastraStreamTerminalStatus | Promise<MastraStreamTerminalStatus>;
}

function encode(event: unknown): Uint8Array {
  return new TextEncoder().encode(
    `data: ${JSON.stringify(ChatStreamEventSchema.parse(event))}\n\n`,
  );
}

export function mastraStreamResponse(
  text: AsyncIterable<string>,
  messageId: string,
  options: MastraStreamResponseOptions = {},
): Response {
  let upstreamIterator: AsyncIterator<string> | null = null;
  let cancelled = false;
  let abortNotified = false;
  let completionNotified = false;

  const notifyAbort = async (): Promise<void> => {
    if (abortNotified || !options.onAbort) return;
    abortNotified = true;
    try {
      await options.onAbort();
    } catch {
      // Abort cleanup is best-effort and must not mask stream shutdown.
    }
  };

  const notifyCompletion = async (): Promise<MastraStreamTerminalStatus> => {
    if (completionNotified || !options.onComplete) return 'failed';
    completionNotified = true;
    return options.onComplete();
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let started = false;
      let ended = false;
      upstreamIterator = text[Symbol.asyncIterator]();
      try {
        if (options.signal?.aborted) {
          throw options.signal.reason ?? new DOMException('Aborted', 'AbortError');
        }
        controller.enqueue(encode({ type: 'text-start', id: messageId }));
        started = true;
        for (
          let next = await upstreamIterator.next();
          !next.done;
          next = await upstreamIterator.next()
        ) {
          if (options.signal?.aborted) {
            throw options.signal.reason ?? new DOMException('Aborted', 'AbortError');
          }
          if (next.value) {
            controller.enqueue(encode({ type: 'text-delta', id: messageId, delta: next.value }));
          }
        }
        if (options.meta) {
          controller.enqueue(
            encode({ type: 'data-multi-agent-meta', id: options.meta.id, data: options.meta.data }),
          );
        }
        controller.enqueue(encode({ type: 'text-end', id: messageId }));
        const status = options.onComplete ? await notifyCompletion() : 'persisted';
        controller.enqueue(encode({ type: 'turn-complete', id: messageId, status }));
        ended = true;
      } catch (error) {
        if (started && !ended) {
          const status = options.signal?.aborted
            ? 'interrupted'
            : options.onComplete
              ? await notifyCompletion()
              : 'failed';
          controller.enqueue(encode({ type: 'turn-complete', id: messageId, status }));
        }
        if (!cancelled && !options.signal?.aborted) {
          controller.enqueue(
            encode({
              type: 'error',
              errorText: error instanceof Error ? error.message : 'Mastra stream failed.',
            }),
          );
        }
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
