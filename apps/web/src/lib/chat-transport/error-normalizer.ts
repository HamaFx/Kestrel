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

// Structured API error-envelope decoding for chat failures.
import { safeParseJson } from '@kestrel/shared';

import { getContentType } from './sse-parser';

export async function surfaceApiErrorEnvelope(res: Response): Promise<Response> {
  if (getContentType(res).includes('application/json')) {
    try {
      const json = (await res.clone().json()) as { error?: { message?: unknown } } | null;
      const message = json?.error?.message;
      if (typeof message === 'string' && message.length > 0) {
        return new Response(message, {
          status: res.status,
          statusText: res.statusText,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }
    } catch {
      // Not a parseable JSON envelope — fall through to the raw response.
    }
  }
  return res;
}

/**
 * P1-15 fallback — decode a raw `{error:{code,message}}` envelope that
 * survived into an error message (e.g. an error part emitted by a stream
 * adapter that did not unwrap the envelope). Returns the display text for
 * any chat error.
 */
export function chatErrorText(err: unknown): string {
  const message =
    err instanceof Error ? err.message : err === null || err === undefined ? '' : String(err);
  const trimmed = message.trim();
  if (trimmed.startsWith('{')) {
    const json = safeParseJson<{ error?: { message?: unknown } } | null>(trimmed, null);
    const inner = json?.error?.message;
    if (typeof inner === 'string' && inner.length > 0) return inner;
  }
  return message || 'Something went wrong.';
}

/** fetch wrapper that bridges queued jobs and legacy SSE into the AI SDK data stream. */
