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

// Mutation draft JSON → single-card AI SDK stream.
import type { MutationDraftEvent } from '@kestrel/shared';

import { encodeChunk } from './sse-parser';

export function mutationDraftToStreamResponse(draft: MutationDraftEvent): Response {
  const id = crypto.randomUUID();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encodeChunk({ type: 'text-start', id }));
      controller.enqueue(
        encodeChunk({
          type: 'data-mutation-confirmation',
          id,
          data: draft.payload,
        }),
      );
      controller.enqueue(encodeChunk({ type: 'text-end', id }));
      controller.close();
    },
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream; charset=utf-8' } });
}

/**
 * P1-15 — the API boundary returns structured JSON error envelopes
 * `{error:{code,message}}`, but the AI SDK's transport turns any non-OK
 * response into `new Error(await response.text())`, so the raw JSON body was
 * shown to the user. Rewrite a non-OK JSON envelope response so the error
 * the SDK throws carries the server's `error.error.message` as its message.
 * Non-JSON or non-envelope bodies pass through untouched.
 */
