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

// Unified AI SDK v5 chat transport.
//
// Smooths over three backend modes: native data stream, legacy multi-agent
// SSE, and Full-mode background jobs. The UI sees one `useChat` surface.
import { AnalysisQueuedEventSchema, MutationDraftEventSchema } from '@kestrel/shared';
import { DefaultChatTransport, type HttpChatTransportInitOptions, type UIMessage } from 'ai';

import { surfaceApiErrorEnvelope } from './error-normalizer';
import { pollJobToStreamResponse } from './job-stream';
import { mutationDraftToStreamResponse } from './mutation-stream';
import { getContentType, transformSseToDataStream } from './sse-parser';
import type { AgentProgress, KestrelChatTransportOptions } from './types';

export { chatErrorText } from './error-normalizer';
export type { AgentProgress, KestrelChatTransportOptions } from './types';

async function kestrelChatFetch(
  onProgress: (p: AgentProgress | null) => void,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const res = await globalThis.fetch(input, init);

  if (!res.ok) {
    return surfaceApiErrorEnvelope(res);
  }
  if (!res.body) {
    return res;
  }

  const contentType = getContentType(res);

  if (contentType.includes('application/json')) {
    let json: unknown;
    try {
      json = await res.clone().json();
    } catch {
      return res;
    }

    const queued = AnalysisQueuedEventSchema.safeParse(json);
    if (queued.success) {
      return pollJobToStreamResponse(queued.data.jobId, init?.signal ?? undefined, onProgress);
    }
    const draft = MutationDraftEventSchema.safeParse(json);
    if (draft.success) {
      return mutationDraftToStreamResponse(draft.data);
    }
    // Any other JSON response is not a valid chat stream; let it fail downstream.
    return res;
  }

  if (contentType.includes('text/event-stream')) {
    return transformSseToDataStream(res, onProgress);
  }

  return res;
}

export function createKestrelChatTransport(
  options: KestrelChatTransportOptions,
): DefaultChatTransport<UIMessage> {
  const onProgress = options.onAgentProgress ?? (() => {});
  const transportOptions: HttpChatTransportInitOptions<UIMessage> = {
    ...(options.api !== undefined && { api: options.api }),
    ...(options.headers !== undefined && { headers: options.headers }),
    ...(options.body !== undefined && { body: options.body }),
    ...(options.prepareSendMessagesRequest !== undefined && {
      prepareSendMessagesRequest: options.prepareSendMessagesRequest,
    }),
    fetch: (input, init) => kestrelChatFetch(onProgress, input, init),
  };
  return new DefaultChatTransport<UIMessage>(transportOptions);
}
