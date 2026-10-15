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

import { ChatStreamEventSchema, type ChatStreamEvent } from '@kestrel/shared';

export interface MastraStreamResponseMeta {
  readonly id: string;
  readonly data: Record<string, unknown>;
}

export const MASTRA_STREAM_TERMINAL_STATUSES = [
  'persisted',
  'persistence-failed',
  'interrupted',
  'failed',
] as const;

export type MastraStreamTerminalStatus = (typeof MASTRA_STREAM_TERMINAL_STATUSES)[number];

export interface MastraStreamTerminalMetadata {
  executionOutcome: 'completed' | 'failed' | 'cancelled';
  answerOutcome: 'ready' | 'blocked' | 'degraded' | 'partial';
  terminalReason?: string;
}

export function isMastraStreamTerminalStatus(value: string): value is MastraStreamTerminalStatus {
  return (MASTRA_STREAM_TERMINAL_STATUSES as readonly string[]).includes(value);
}

export interface MastraStreamResponseOptions {
  readonly meta?: MastraStreamResponseMeta;
  readonly signal?: AbortSignal;
  readonly onAbort?: () => void | Promise<void>;
  /** Called exactly once after upstream consumption, before the stream closes. */
  readonly onComplete?: () => MastraStreamTerminalStatus | Promise<MastraStreamTerminalStatus>;
  /** Optional post-stream events (e.g. tool parts, final metadata, evidence replacement) emitted before text-end. */
  readonly afterTextEvents?: () => ChatStreamEvent[] | Promise<ChatStreamEvent[]>;
}

function encode(event: unknown): Uint8Array {
  return new TextEncoder().encode(
    `data: ${JSON.stringify(ChatStreamEventSchema.parse(event))}\n\n`,
  );
}

export function mastraStreamResponse(
  text: AsyncIterable<string | ChatStreamEvent>,
  messageId: string,
  options: MastraStreamResponseOptions = {},
): Response {
  let upstreamIterator: AsyncIterator<string | ChatStreamEvent> | null = null;
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
          if (typeof next.value === 'string') {
            if (next.value.length > 0) {
              controller.enqueue(encode({ type: 'text-delta', id: messageId, delta: next.value }));
            }
          } else if (next.value && typeof next.value === 'object') {
            controller.enqueue(encode(next.value));
          }
        }
        if (options.afterTextEvents) {
          const extraEvents = await options.afterTextEvents();
          for (const ev of extraEvents) {
            controller.enqueue(encode(ev));
          }
        }
        if (options.meta) {
          controller.enqueue(
            encode({ type: 'data-multi-agent-meta', id: options.meta.id, data: options.meta.data }),
          );
        }
        const status = options.onComplete ? await notifyCompletion() : 'persisted';
        controller.enqueue(encode({ type: 'text-end', id: messageId }));
        controller.enqueue(encode({ type: 'turn-complete', id: messageId, status }));
        ended = true;
      } catch (error) {
        if (started && !ended && !cancelled) {
          const status = options.signal?.aborted
            ? 'interrupted'
            : options.onComplete
              ? await notifyCompletion()
              : 'failed';
          try {
            controller.enqueue(encode({ type: 'turn-complete', id: messageId, status }));
          } catch {}
        }
        if (!cancelled && !options.signal?.aborted) {
          try {
            controller.enqueue(
              encode({
                type: 'error',
                errorText: error instanceof Error ? error.message : 'Mastra stream failed.',
              }),
            );
          } catch {}
        }
        if (started && !ended) await notifyAbort();
      } finally {
        if (started && !ended && !cancelled) {
          try {
            controller.enqueue(encode({ type: 'text-end', id: messageId }));
          } catch {}
        }
        upstreamIterator = null;
        if (!cancelled) {
          try {
            controller.close();
          } catch {}
        }
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
