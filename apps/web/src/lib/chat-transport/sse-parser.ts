'use client';

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

// Legacy multi-agent SSE → AI SDK data-stream adapter.
import { ChatStreamEventSchema, type ChatStreamEvent } from '@kestrel/shared';

import type { AgentProgress } from './types';

const encoder = new TextEncoder();

export function encodeChunk(chunk: object): Uint8Array {
  // DefaultChatTransport parses JSON event streams using SSE framing.
  // Keep adapted legacy/job streams on the same wire format as the server's
  // native multi-agent response (`data: <json>\n\n`).
  return encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`);
}

export function getContentType(res: Response): string {
  return res.headers.get('content-type')?.toLowerCase() ?? '';
}

/** Minimal SSE-to-AI-SDK-data-stream converter. */
export function transformSseToDataStream(
  res: Response,
  onProgress: (p: AgentProgress | null) => void,
): Response {
  const id = crypto.randomUUID();
  let started = false;
  let ended = false;
  let emittedError = false;
  let protocolError: string | null = null;
  let activeTextId: string | null = null;
  let pendingFlush: ReturnType<typeof setTimeout> | null = null;

  const handleStreamEvent = (
    event: ChatStreamEvent,
    controller: ReadableStreamDefaultController<Uint8Array>,
  ) => {
    switch (event.type) {
      case 'text-start': {
        started = true;
        activeTextId = event.id;
        controller.enqueue(encodeChunk({ type: 'text-start', id: event.id }));
        break;
      }
      case 'text-delta': {
        if (!started) {
          started = true;
          activeTextId = event.id;
          controller.enqueue(encodeChunk({ type: 'text-start', id: event.id }));
        }
        const textId = activeTextId ?? event.id;
        controller.enqueue(encodeChunk({ type: 'text-delta', id: textId, delta: event.delta }));
        break;
      }
      case 'text-end': {
        const textId = activeTextId ?? event.id;
        if (!started) {
          started = true;
          activeTextId = textId;
          controller.enqueue(encodeChunk({ type: 'text-start', id: textId }));
        }
        controller.enqueue(encodeChunk({ type: 'text-end', id: textId }));
        ended = true;
        break;
      }
      case 'tool-input-start':
      case 'tool-input-delta':
      case 'tool-input-available':
      case 'tool-output-available':
      case 'tool-output-error': {
        controller.enqueue(encodeChunk(event));
        break;
      }
      case 'data-evidence-blocked': {
        controller.enqueue(
          encodeChunk({
            type: 'data-evidence-blocked',
            id: event.id ?? activeTextId ?? id,
            data: event.data,
          }),
        );
        break;
      }
      case 'data-memory-degraded': {
        controller.enqueue(
          encodeChunk({
            type: 'data-memory-degraded',
            id: event.id ?? activeTextId ?? id,
            reason: event.reason,
            createdAt: event.createdAt,
          }),
        );
        break;
      }
      case 'data-multi-agent-meta': {
        controller.enqueue(
          encodeChunk({
            type: event.type,
            id: event.id,
            data: event.data,
            transient: event.transient,
          }),
        );
        break;
      }
      case 'data-agent-progress': {
        const progress = (event.data ?? event) as AgentProgress;
        onProgress(progress);
        controller.enqueue(
          encodeChunk({ type: 'data-agent-progress', id, data: progress, transient: true }),
        );
        break;
      }
      case 'error': {
        emittedError = true;
        controller.enqueue(encodeChunk({ type: 'error', errorText: event.errorText }));
        break;
      }
      case 'turn-complete': {
        break;
      }
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      if (!res.body) {
        controller.enqueue(
          encodeChunk({ type: 'error', errorText: 'Chat stream returned no response body.' }),
        );
        onProgress(null);
        controller.close();
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const flush = () => {
        if (pendingFlush) {
          clearTimeout(pendingFlush);
          pendingFlush = null;
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (raw === '[DONE]') continue;
            let parsed: Record<string, unknown> | undefined;
            try {
              parsed = JSON.parse(raw) as Record<string, unknown>;
            } catch {
              protocolError ??= 'Chat stream contained malformed JSON.';
              continue;
            }
            if (!parsed) {
              protocolError ??= 'Chat stream contained an empty event.';
              continue;
            }

            const streamEvent = ChatStreamEventSchema.safeParse(parsed);
            if (!streamEvent.success) {
              // Do not turn a truncated/unknown event into a successful
              // assistant message. Surface the protocol failure explicitly.
              protocolError ??= 'Chat stream contained an unsupported or malformed event.';
              continue;
            }
            handleStreamEvent(streamEvent.data, controller);
          }
        }

        // A well-formed SSE response ends events with a blank line, but
        // flush the decoder and process a final unterminated line as a
        // defensive measure so the last event is not silently dropped.
        buffer += decoder.decode();
        if (buffer.startsWith('data: ')) {
          const raw = buffer.slice(6).trim();
          if (raw && raw !== '[DONE]') {
            try {
              const parsed = JSON.parse(raw) as Record<string, unknown>;
              const streamEvent = ChatStreamEventSchema.safeParse(parsed);
              if (!streamEvent.success) {
                protocolError ??= 'Chat stream ended with a malformed event.';
              } else {
                handleStreamEvent(streamEvent.data, controller);
              }
            } catch {
              protocolError ??= 'Chat stream ended with malformed JSON.';
            }
          }
        }
      } catch (err) {
        // Reader cancellation is still a terminal condition. Preserve the
        // user's explicit stop as a quiet close, but surface other reader
        // failures instead of presenting truncated text as complete.
        protocolError ??= err instanceof Error ? err.message : String(err);
      } finally {
        flush();
        if (protocolError && !emittedError) {
          controller.enqueue(encodeChunk({ type: 'error', errorText: protocolError }));
        }
        if (started && !ended) {
          controller.enqueue(encodeChunk({ type: 'text-end', id: activeTextId ?? id }));
        }
        // Keep the terminal committee state visible after both success and
        // failure. A subsequent turn replaces it with a fresh snapshot.
        if (!ended && !emittedError && !protocolError) onProgress(null);
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { 'content-type': 'text/event-stream; charset=utf-8' } });
}

/** Poll a background analysis job and synthesize an AI SDK data stream. */
